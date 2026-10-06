import { BadRequestException } from '@nestjs/common';
import { AccessService } from '../../src/common/access.service';
import { ReportsService } from '../../src/reports/reports.service';

const actor = { id: 4, role: 'LEADER', coffeeShopAssignments: [{ coffeeShopId: 7 }] };
const enps = {
  id: 1, name: 'eNPS', code: 'ENPS', unit: '%', direction: 'HIGHER_IS_BETTER', isActive: true,
  thresholdStrong: 95, thresholdMedium: 80, pointsStrong: 11.5, pointsMedium: 5.75, pointsCritical: 0,
};
const deposit = {
  ...enps, id: 2, name: 'Доля депозита в выручке', code: 'DEPOSIT', isActive: false,
  direction: 'LOWER_IS_BETTER', thresholdStrong: 1, thresholdMedium: 2, pointsStrong: 8.5, pointsMedium: 4.25,
};
const oldSnapshot = { rating: 20, maxPoints: 20, results: [{ metricId: 1 }, { metricId: 2 }] };

function setup() {
  const metrics = [{ ...enps }, { ...deposit }];
  let report: any = {
    id: 51, coffeeShopId: 7, year: 2026, month: 9, isLocked: false, status: 'NOT_FILLED',
    revenue: 1000, drinksCount: 50, formData: { metricPlan_2: 12 }, ratingSnapshot: oldSnapshot,
    metricValues: [{ metricId: 1, absoluteValue: 96 }, { metricId: 2, absoluteValue: 10 }], analyses: [],
  };
  const prisma: any = {
    coffeeShop: { findUnique: jest.fn().mockResolvedValue({ id: 7, cityId: 2, isActive: true }) },
    metric: { findMany: jest.fn(async (query?: any) => metrics.filter(metric => query?.where?.isActive === undefined || metric.isActive === query.where.isActive)) },
    monthlyReport: {
      findUnique: jest.fn(async () => report),
      findUniqueOrThrow: jest.fn(async () => report),
      upsert: jest.fn(async ({ update }) => { report = { ...report, ...update }; return report; }),
      update: jest.fn(async ({ data }) => { report = { ...report, ...data }; return report; }),
    },
    analysisQuestion: { findMany: jest.fn().mockResolvedValue([{ questionKey: 'enps_problem' }]) },
    metricValue: {
      upsert: jest.fn(async ({ create }) => {
        report = { ...report, metricValues: [
          ...report.metricValues.filter((value: any) => value.metricId !== create.metricId),
          { metricId: create.metricId, absoluteValue: create.absoluteValue },
        ] };
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        report = { ...report, metricValues: report.metricValues.map((value: any) => value.metricId === where.metricId ? { ...value, ...data } : value) };
      }),
    },
    reportAnalysis: { upsert: jest.fn(async ({ create }) => {
      report = { ...report, analyses: [{ questionKey: create.questionKey, content: create.content }] };
    }) },
    reportEditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async work => work(prisma)),
  };
  const service = new ReportsService(prisma, new AccessService(prisma), { get: jest.fn().mockReturnValue('false') } as any);
  return { service, prisma, metrics, current: () => report };
}

describe('Reports after archiving a metric', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-06T10:00:00Z')); });
  afterEach(() => jest.useRealTimers());

  it('accepts a stale draft payload, recalculates active metrics and preserves the archived value and plan', async () => {
    const { service, prisma, current } = setup();

    const saved = await service.createOrUpdateDraft({ ...current(), metricValues: [
      { metricId: 1, absoluteValue: 80 }, { metricId: 2, absoluteValue: 999 },
    ] }, actor);

    expect(saved.score).toMatchObject({ rating: 5.75, maxPoints: 11.5, results: [{ metricId: 1, pointsAwarded: 5.75 }] });
    expect(current().ratingSnapshot).toEqual(saved.score);
    expect(current().metricValues.find((value: any) => value.metricId === 2)).toEqual({ metricId: 2, absoluteValue: 10 });
    expect(current().formData.metricPlan_2).toBe(12);
    expect(prisma.reportEditLog.create.mock.calls.some(([input]: any[]) => input.data.fieldChanged === 'metric:2')).toBe(false);
  });

  it('allows saving analysis even when the report contains an archived metric', async () => {
    const { service, current } = setup();

    const saved = await service.updateAnalysis(51, 'enps_problem', 'Причины и план действий', actor);

    expect(saved.analyses).toEqual([{ questionKey: 'enps_problem', content: 'Причины и план действий' }]);
    expect(saved.score).toMatchObject({ rating: 11.5, results: [{ metricId: 1 }] });
    expect(current().metricValues.find((value: any) => value.metricId === 2).absoluteValue).toBe(10);
  });

  it('uses the latest active metrics if one is archived before the draft transaction starts', async () => {
    const { service, prisma, metrics, current } = setup();
    metrics[1].isActive = true;
    prisma.$transaction.mockImplementation(async (work: (tx: any) => Promise<unknown>) => {
      metrics[1].isActive = false;
      return work(prisma);
    });

    const saved = await service.createOrUpdateDraft({ ...current(), metricValues: [
      { metricId: 1, absoluteValue: 80 }, { metricId: 2, absoluteValue: 999 },
    ] }, actor);

    expect(saved.score).toMatchObject({ rating: 5.75, maxPoints: 11.5, results: [{ metricId: 1 }] });
    expect(current().metricValues.find((value: any) => value.metricId === 2).absoluteValue).toBe(10);
  });

  it('still rejects an unknown metric without saving any changes', async () => {
    const { service, prisma, current } = setup();

    await expect(service.createOrUpdateDraft({ ...current(), metricValues: [{ metricId: 999, absoluteValue: 1 }] }, actor)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.monthlyReport.upsert).not.toHaveBeenCalled();
    expect(current().ratingSnapshot).toEqual(oldSnapshot);
  });

  it('does not require the archived value to submit a report', async () => {
    const { service, current } = setup();
    current().metricValues[1].absoluteValue = null;

    const submitted = await service.submitReport(51, actor);

    expect(submitted).toMatchObject({ status: 'SUBMITTED', score: { rating: 11.5, maxPoints: 11.5, results: [{ metricId: 1 }] } });
  });

  it('uses the preserved value again after the metric is restored', async () => {
    const { service, metrics, current } = setup();
    await service.createOrUpdateDraft({ ...current() }, actor);
    metrics[1].isActive = true;

    const restored = await service.getReports(7, 2026, 9, actor);

    expect(restored.score).toMatchObject({ rating: 20, maxPoints: 20, results: [
      { metricId: 1, pointsAwarded: 11.5 }, { metricId: 2, absoluteValue: 10, pointsAwarded: 8.5 },
    ] });
  });

  it('keeps the historical snapshot with the archived metric unchanged', async () => {
    const { service, prisma, current } = setup();
    current().month = 8;
    current().isLocked = true;

    const history = await service.getReports(7, 2026, 8, actor);

    expect(history).toMatchObject({ isEditable: false, score: oldSnapshot });
    expect(prisma.monthlyReport.update).not.toHaveBeenCalled();
  });
});
