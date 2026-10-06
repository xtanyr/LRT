import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

  it('replaces the seeded future submission date with the actual successful submission time for both leader views', async () => {
    jest.setSystemTime(new Date('2026-10-01T05:20:00.000Z'));
    const initial = { ...historicalReport(), month: 9, isLocked: false, submittedAt: new Date('2026-10-05T09:00:00.000Z') };
    const { service, current } = setup(undefined, initial);

    const submitted = await service.submitReport(51, actor);

    expect(submitted.submittedAt.toISOString()).toBe('2026-10-01T05:20:00.000Z');
    expect(current().submittedAt.toISOString()).toBe('2026-10-01T05:20:00.000Z');
    expect((await service.getReportById(51, actor)).submittedAt.toISOString()).toBe('2026-10-01T05:20:00.000Z');
    expect((await service.getReportById(51, { id: 6, role: 'CITY_LEADER', cityAssignments: [{ cityId: 2 }] })).submittedAt.toISOString()).toBe('2026-10-01T05:20:00.000Z');
  });

  it('refreshes a past submission timestamp on another explicit submission', async () => {
    jest.setSystemTime(new Date('2026-10-02T06:01:00.000Z'));
    const initial = { ...historicalReport(), month: 9, isLocked: false, submittedAt: new Date('2026-10-01T05:20:00.000Z') };
    const { service } = setup(undefined, initial);

    const submitted = await service.submitReport(51, actor);

    expect(submitted.submittedAt.toISOString()).toBe('2026-10-02T06:01:00.000Z');
  });

  it('audits the actual resubmitting actor without changing the original leader attribution', async () => {
    jest.setSystemTime(new Date('2026-10-02T06:01:00.000Z'));
    const initial = { ...historicalReport(), month: 9, isLocked: false, submittedAt: new Date('2026-10-01T05:20:00.000Z') };
    const { service, prisma } = setup(undefined, initial);

    const submitted = await service.submitReport(51, { id: 6, role: 'CITY_LEADER', cityAssignments: [{ cityId: 2 }] });

    expect(submitted.submittedById).toBe(4);
    expect(prisma.reportEditLog.create).toHaveBeenCalledWith({ data: {
      reportId: 51, editedById: 6, fieldChanged: 'submittedAt',
      oldValue: '2026-10-01T05:20:00.000Z', newValue: '2026-10-02T06:01:00.000Z',
    } });
  });

  it('does not change the previous submission timestamp when submission fails validation', async () => {
    const initial = { ...historicalReport(), revenue: 0 };
    const { service, prisma, current } = setup('true', initial);

    await expect(service.submitReport(51, actor)).rejects.toBeInstanceOf(BadRequestException);

    expect(current().submittedAt).toEqual(new Date('2026-09-05T10:00:00Z'));
    expect(prisma.monthlyReport.update).not.toHaveBeenCalled();
    expect(prisma.reportEditLog.create).not.toHaveBeenCalled();
  });

  it.each([-1, '-0,01', '-1 000,25'])('rejects a negative metric value (%s) without changing the saved report or rating', async (absoluteValue) => {
    const { service, prisma, current } = setup('true');
    const previous = current();

    await expect(service.createOrUpdateDraft({
      coffeeShopId: 7, year: 2026, month: 8, revenue: 1000, drinksCount: 50,
      metricValues: [{ metricId: 1, absoluteValue }],
    }, actor)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/не может быть отрицательным/) });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.metricValue.upsert).not.toHaveBeenCalled();
    expect(prisma.reportEditLog.create).not.toHaveBeenCalled();
    expect(current()).toEqual(previous);
    expect(current().ratingSnapshot).toEqual(originalSnapshot);
  });

  it('rejects negative metric values through the PATCH service path', async () => {
    const { service, prisma } = setup('true');

    await expect(service.updateMetricValue(51, 1, { absoluteValue: -10 }, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['metricPlan_1', 'gifts', 'giftsPlan', 'personnelCosts', 'adminCosts', 'revenuePlan', 'drinksPlan'])('rejects a negative numeric form field (%s) before saving', async (key) => {
    const { service, prisma } = setup('true');

    await expect(service.createOrUpdateDraft({
      coffeeShopId: 7, year: 2026, month: 8, revenue: 1000, drinksCount: 50,
      formData: { [key]: '-5,25' },
    }, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([0, '0', null, ''])('still accepts zero and optional empty metric values (%s)', async (absoluteValue) => {
    const { service, current } = setup('true');

    await service.createOrUpdateDraft({
      coffeeShopId: 7, year: 2026, month: 8, revenue: 1000, drinksCount: 50,
      metricValues: [{ metricId: 1, absoluteValue }], formData: { gifts: 0, metricPlan_1: '' },
    }, actor);

    expect(current().metricValues[0].absoluteValue).toBe(absoluteValue === '' || absoluteValue === null ? null : 0);
    expect(current().formData).toEqual({ gifts: 0, metricPlan_1: null });
  });

  it('marks history editable in test mode without changing its stored rating or lock', async () => {
    const { service, prisma } = setup('true');
    const report = await service.getReports(7, 2026, 8, actor);

    expect(report).toMatchObject({ isEditable: true, isLocked: true, score: originalSnapshot });
    expect(prisma.monthlyReport.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps imported source ratings read-only even when historical test editing is enabled', async () => {
    const imported={...historicalReport(),formData:{sourceSheet:'Метрики',fields:[{key:'revenue',value:1000}],importSource:{kind:'legacy-xlsx'}},ratingSnapshot:{...originalSnapshot,source:{kind:'legacy-xlsx',policy:'preserve-source-score'}}};
    const {service}=setup('true',imported);
    expect(await service.getReports(7,2026,8,actor)).toMatchObject({isEditable:false,isLocked:true,score:imported.ratingSnapshot});
  });

  it('explains why an imported report cannot be edited instead of rejecting its source metadata as numeric input', async () => {
    const imported={...historicalReport(),formData:{sourceSheet:'Метрики',fields:[{key:'revenue',value:1000}],importSource:{kind:'legacy-xlsx'}},ratingSnapshot:{...originalSnapshot,source:{kind:'legacy-xlsx',policy:'preserve-source-score'}}};
    const {service,prisma,current}=setup('true',imported);
    await expect(service.createOrUpdateDraft({coffeeShopId:7,year:2026,month:8,revenue:1000,drinksCount:50,formData:imported.formData,metricValues:[{metricId:1,absoluteValue:70}]},actor)).rejects.toMatchObject({status:403,message:expect.stringContaining('Импортированный')});
    expect(prisma.monthlyReport.update).not.toHaveBeenCalled();
    expect(current().ratingSnapshot).toEqual(imported.ratingSnapshot);
  });

  it('does not overwrite an imported snapshot through explicit submission in test mode', async () => {
    const imported={...historicalReport(),ratingSnapshot:{...originalSnapshot,source:{kind:'legacy-xlsx',policy:'preserve-source-score'}}};
    const {service,prisma,current}=setup('true',imported);
    await expect(service.submitReport(51,actor)).rejects.toMatchObject({status:403,message:expect.stringContaining('Импортированный')});
    expect(prisma.monthlyReport.update).not.toHaveBeenCalled();
    expect(current().ratingSnapshot).toEqual(imported.ratingSnapshot);
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
    expect(await service.submitReport(51, actor)).toMatchObject({ status: 'SUBMITTED', submittedAt: new Date('2026-10-02T10:00:00Z'), isEditable: true, score: { rating: 11.5 } });
  });

  it('records each changed form field and its old/new value without logging unchanged fields', async () => {
    const initial = { ...historicalReport(), formData: { gifts: 0, metricPlan_1: 97, equipment: 50, rent: 100 } };
    const { service, prisma } = setup('true', initial);

    await service.createOrUpdateDraft({
      coffeeShopId: 7, year: 2026, month: 8, revenue: 1000, drinksCount: 50,
      formData: { gifts: 100, metricPlan_1: 95, rent: 100 },
    }, actor);

    const changes = prisma.reportEditLog.create.mock.calls.map(([input]: any[]) => input.data);
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ reportId: 51, editedById: 4, fieldChanged: 'formData:gifts', oldValue: '0', newValue: '100' }),
      expect.objectContaining({ fieldChanged: 'formData:metricPlan_1', oldValue: '97', newValue: '95' }),
      expect.objectContaining({ fieldChanged: 'formData:equipment', oldValue: '50', newValue: null }),
    ]));
    expect(changes.some((change: any) => change.fieldChanged === 'formData:rent' || change.fieldChanged === 'formData')).toBe(false);
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
