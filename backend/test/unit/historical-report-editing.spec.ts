import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { ReportsService } from '../../src/reports/reports.service';
import { AccessService } from '../../src/common/access.service';

const actor = { id: 4, role: 'LEADER', coffeeShopAssignments: [{ coffeeShopId: 7 }] };
const metric = {
  id: 1, name: 'eNPS', code: 'ENPS', unit: '%', direction: 'HIGHER_IS_BETTER',
  thresholdStrong: 95, thresholdMedium: 80, pointsStrong: 11.5, pointsMedium: 5.75, pointsCritical: 0,
};
const originalSnapshot = { rating: 88, maxPoints: 100, results: [] };
const historicalReport = () => ({
  id: 51, coffeeShopId: 7, year: 2026, month: 8, isLocked: true, status: 'SUBMITTED',
  revenue: 1000, drinksCount: 50, formData: {}, ratingSnapshot: originalSnapshot,
  submittedAt: new Date('2026-09-05T10:00:00Z'), submittedById: 4,
  metricValues: [{ metricId: 1, absoluteValue: 96 }], analyses: [],
});

function setup(setting?: string, initial: ReturnType<typeof historicalReport> | null = historicalReport()) {
  let report: any = initial;
  const prisma: any = {
    coffeeShop: { findUnique: jest.fn().mockResolvedValue({ id: 7, cityId: 2, isActive: true }) },
    monthlyReport: {
      findUnique: jest.fn(async () => report),
      findUniqueOrThrow: jest.fn(async () => report),
      upsert: jest.fn(async ({ create, update }) => {
        report = report ? { ...report, ...update } : { id: 51, isLocked: false, status: 'NOT_FILLED', metricValues: [], analyses: [], ...create };
        return report;
      }),
      update: jest.fn(async ({ data }) => { report = { ...report, ...data }; return report; }),
    },
    metric: { findMany: jest.fn().mockResolvedValue([metric]) },
    analysisQuestion: { findMany: jest.fn().mockResolvedValue([{ questionKey: 'enps_problem' }]) },
    metricValue: {
      upsert: jest.fn(async ({ create }) => {
        report = { ...report, metricValues: [{ metricId: create.metricId, absoluteValue: create.absoluteValue }] };
      }),
      updateMany: jest.fn(async ({ data }) => { report = { ...report, metricValues: report.metricValues.map((value: any) => ({ ...value, ...data })) }; }),
    },
    reportAnalysis: { upsert: jest.fn(async ({ create }) => { report = { ...report, analyses: [{ questionKey: create.questionKey, content: create.content }] }; }) },
    reportEditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (work) => work(prisma)),
  };
  const config = { get: jest.fn((key: string) => key === 'ALLOW_HISTORICAL_REPORT_EDITING' ? setting : undefined) };
  const service = new (ReportsService as any)(prisma, new AccessService(prisma), config as unknown as ConfigService) as ReportsService;
  return { service, prisma, config, current: () => report };
}

describe('Historical report editing for UAT', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-02T10:00:00Z')); });
  afterEach(() => jest.useRealTimers());

  it('marks history editable in test mode without changing its stored rating or lock', async () => {
    const { service, prisma } = setup('true');
    const report = await service.getReports(7, 2026, 8, actor);

    expect(report).toMatchObject({ isEditable: true, isLocked: true, score: originalSnapshot });
    expect(prisma.monthlyReport.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('saves a locked report, recalculates the snapshot and records who changed the metrics and analysis', async () => {
    const { service, prisma, current } = setup('true');
    const report = await service.createOrUpdateDraft({
      coffeeShopId: 7, year: 2026, month: 8, revenue: 1000, drinksCount: 50,
      metricValues: [{ metricId: 1, absoluteValue: 70 }], analyses: [{ questionKey: 'enps_problem', content: 'Тест триггера' }],
    }, actor);

    expect(report).toMatchObject({ isEditable: true, isLocked: true, status: 'SUBMITTED', score: { rating: 0 } });
    expect(current().ratingSnapshot).toMatchObject({ rating: 0, results: [{ metricId: 1, zone: 'CRITICAL', pointsAwarded: 0 }] });
    expect(prisma.reportEditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ reportId: 51, editedById: 4, fieldChanged: 'metric:1', oldValue: '"96"', newValue: '"70"' }) });
    expect(prisma.reportEditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ editedById: 4, fieldChanged: 'analysis:enps_problem' }) });
    expect(current().submittedAt).toEqual(new Date('2026-09-05T10:00:00Z'));
  });

  it('allows creating and submitting a missing historical report in test mode', async () => {
    const { service } = setup('true', null);
    expect(await service.getReports(7, 2026, 8, actor)).toBeNull();
    await service.createOrUpdateDraft({ coffeeShopId: 7, year: 2026, month: 8, revenue: 1000, drinksCount: 50, metricValues: [{ metricId: 1, absoluteValue: 96 }] }, actor);
    expect(await service.submitReport(51, actor)).toMatchObject({ status: 'SUBMITTED', isEditable: true, score: { rating: 11.5 } });
  });

  it.each([undefined, 'false', 'TRUE'])('keeps old periods read-only unless the flag is explicitly true (%s)', async (setting) => {
    const { service, prisma } = setup(setting);
    expect(await service.getReports(7, 2026, 8, actor)).toMatchObject({ isEditable: false, score: originalSnapshot });
    await expect(service.createOrUpdateDraft({ coffeeShopId: 7, year: 2026, month: 8 }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.submitReport(51, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.monthlyReport.upsert).not.toHaveBeenCalled();
    expect(prisma.monthlyReport.update).not.toHaveBeenCalled();
  });

  it('restores read-only access immediately after the test flag is switched off', async () => {
    const { service, config } = setup('true');
    expect(await service.getReports(7, 2026, 8, actor)).toMatchObject({ isEditable: true });
    config.get.mockReturnValue('false');

    expect(await service.getReports(7, 2026, 8, actor)).toMatchObject({ isEditable: false, isLocked: true });
    await expect(service.createOrUpdateDraft({ coffeeShopId: 7, year: 2026, month: 8 }, actor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not grant access to another coffee shop in test mode', async () => {
    const { service, prisma } = setup('true');
    const outsider = { id: 5, role: 'LEADER', coffeeShopAssignments: [{ coffeeShopId: 9 }] };

    await expect(service.getReports(7, 2026, 8, outsider)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createOrUpdateDraft({ coffeeShopId: 7, year: 2026, month: 8 }, outsider)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.monthlyReport.upsert).not.toHaveBeenCalled();
  });
});
