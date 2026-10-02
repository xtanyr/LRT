import { BadRequestException } from '@nestjs/common';
import { calculateScore } from '../../src/scoring/rating-calculator';
import { ScoringEngineService } from '../../src/scoring/scoring-engine.service';

const metric = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Metric',
  code: 'GENERIC',
  unit: '%',
  direction: 'HIGHER_IS_BETTER' as const,
  thresholdStrong: 95,
  thresholdMedium: 80,
  pointsStrong: 11.5,
  pointsMedium: 5.75,
  pointsCritical: 0,
  ...overrides,
});

const report = (absoluteValue: number | null, overrides: Record<string, unknown> = {}) => ({
  revenue: 1_000_000,
  drinksCount: 13_000,
  metricValues: [{ metricId: 1, absoluteValue }],
  ...overrides,
});

describe('calculateScore', () => {
  it.each([
    [95, 'TARGET', 11.5],
    [80, 'BELOW_TARGET', 5.75],
    [79.99, 'CRITICAL', 0],
  ])('scores higher-is-better boundaries at %s', (value, zone, points) => {
    const result = calculateScore([metric()], report(value));
    expect(result.results[0]).toMatchObject({ absoluteValue: value, computedPercent: null, zone, pointsAwarded: points, thresholdStrong: 95, thresholdMedium: 80 });
  });

  it.each([
    [2, 'TARGET', 11.5],
    [3, 'BELOW_TARGET', 5.75],
    [3.01, 'CRITICAL', 0],
  ])('scores lower-is-better boundaries at %s', (value, zone, points) => {
    const result = calculateScore([metric({ direction: 'LOWER_IS_BETTER', thresholdStrong: 2, thresholdMedium: 3 })], report(value));
    expect(result.results[0]).toMatchObject({ zone, pointsAwarded: points });
  });

  it.each(['LABOR_COST', 'DESSERT_WRITEOFF', 'PRODUCT_WRITEOFF', 'FREE_ACCESS', 'DEPOSIT'])(
    'converts %s absolute amounts to revenue percent',
    (code) => {
      const result = calculateScore(
        [metric({ code, direction: 'LOWER_IS_BETTER', thresholdStrong: 1, thresholdMedium: 2, pointsStrong: 8.5, pointsMedium: 4.25 })],
        report(10_000),
      );
      expect(result.results[0]).toMatchObject({ computedPercent: 1, zone: 'TARGET', pointsAwarded: 8.5 });
    },
  );

  it('does not infer a revenue ratio from the percent unit alone', () => {
    const result = calculateScore([metric({ code: 'ENPS' })], report(96));
    expect(result.results[0]).toMatchObject({ computedPercent: null, zone: 'TARGET' });
  });

  it('uses the unrounded revenue ratio when selecting a zone', () => {
    const result = calculateScore(
      [metric({ code: 'DESSERT_WRITEOFF', direction: 'LOWER_IS_BETTER', thresholdStrong: 0.8, thresholdMedium: 1, pointsStrong: 8.5, pointsMedium: 4.25 })],
      report(804, { revenue: 100_000 }),
    );
    expect(result.results[0]).toMatchObject({ computedPercent: 0.8, zone: 'BELOW_TARGET', pointsAwarded: 4.25 });
  });

  it('leaves a share metric unscored when revenue is zero', () => {
    const result = calculateScore(
      [metric({ code: 'LABOR_COST', direction: 'LOWER_IS_BETTER', pointsStrong: 8.5 })],
      report(0, { revenue: 0 }),
    );
    expect(result).toMatchObject({ rating: 0, maxPoints: 8.5 });
    expect(result.results[0]).toMatchObject({ absoluteValue: 0, computedPercent: null, zone: null, pointsAwarded: null });
  });

  it('keeps an omitted value distinct from a critical zero score', () => {
    const result = calculateScore([metric()], report(null));
    expect(result.rating).toBe(0);
    expect(result.results[0]).toMatchObject({ absoluteValue: null, computedPercent: null, zone: null, pointsAwarded: null });
  });

  it.each([
    [13_000, 11, 8.5],
    [12_999, 8.5, 7.5],
    [10_000, 8.5, 7.5],
    [9_999, 7.5, 6.2],
    [7_000, 7.5, 6.2],
    [6_999, 6.2, 4],
  ])('uses the performance tier for %s drinks', (drinksCount, strong, medium) => {
    const performance = metric({ code: 'PERFORMANCE', unit: 'ед.', thresholdStrong: 999, thresholdMedium: 998, pointsStrong: 8.5, pointsMedium: 4.25 });
    const strongResult = calculateScore([performance], report(strong, { drinksCount }));
    const mediumResult = calculateScore([performance], report(medium, { drinksCount }));
    expect(strongResult.results[0]).toMatchObject({ thresholdStrong: strong, thresholdMedium: medium, zone: 'TARGET', pointsAwarded: 8.5 });
    expect(mediumResult.results[0]).toMatchObject({ zone: 'BELOW_TARGET', pointsAwarded: 4.25 });
  });

  it('totals five expensive and five inexpensive target metrics to 100', () => {
    const metrics = Array.from({ length: 10 }, (_, index) => metric({
      id: index + 1,
      code: index === 5 ? 'PERFORMANCE' : `M${index}`,
      pointsStrong: index < 5 ? 11.5 : 8.5,
      pointsMedium: index < 5 ? 5.75 : 4.25,
      thresholdStrong: 1,
      thresholdMedium: 0.5,
    }));
    const result = calculateScore(metrics, {
      revenue: 100,
      drinksCount: 13_000,
      metricValues: metrics.map((item, index) => ({ metricId: item.id, absoluteValue: index === 5 ? 11 : 1 })),
    });
    expect(result.rating).toBe(100);
    expect(result.maxPoints).toBe(100);
  });
});

describe('ScoringEngineService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-15T12:00:00Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('returns a locked report snapshot without reading live metrics or writing', async () => {
    const snapshot = { rating: 87.5, maxPoints: 100, results: [{ metricId: 1 }] };
    const prisma = {
      monthlyReport: { findUnique: jest.fn().mockResolvedValue({ id: 4, isLocked: true, ratingSnapshot: snapshot, metricValues: [] }) },
      metric: { findMany: jest.fn() },
      metricValue: { update: jest.fn() },
    };
    const service = new ScoringEngineService(prisma as never);
    await expect(service.calculateRating(1, 2026, 8)).resolves.toBe(snapshot);
    expect(prisma.metric.findMany).not.toHaveBeenCalled();
    expect(prisma.metricValue.update).not.toHaveBeenCalled();
  });

  it('calculates an unlocked report from active metrics without writing', async () => {
    const prisma = {
      monthlyReport: { findUnique: jest.fn().mockResolvedValue({ id: 4, isLocked: false, ratingSnapshot: null, revenue: 100, drinksCount: 13_000, metricValues: [{ metricId: 1, absoluteValue: 95 }] }) },
      metric: { findMany: jest.fn().mockResolvedValue([metric()]) },
      metricValue: { update: jest.fn() },
    };
    const service = new ScoringEngineService(prisma as never);
    await expect(service.calculateRating(1, 2026, 8)).resolves.toMatchObject({ rating: 11.5, maxPoints: 11.5 });
    expect(prisma.metricValue.update).not.toHaveBeenCalled();
  });

  it('does not calculate a locked report whose historical snapshot is missing', async () => {
    const prisma = {
      monthlyReport: { findUnique: jest.fn().mockResolvedValue({ id: 4, isLocked: true, ratingSnapshot: null, metricValues: [] }) },
      metric: { findMany: jest.fn() },
    };
    const service = new ScoringEngineService(prisma as never);
    await expect(service.calculateRating(1, 2026, 8)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.metric.findMany).not.toHaveBeenCalled();
  });

  it('rejects a missing report', async () => {
    const prisma = { monthlyReport: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new ScoringEngineService(prisma as never);
    await expect(service.calculateRating(1, 2026, 8)).rejects.toBeInstanceOf(BadRequestException);
  });
});
