import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReportsService } from '../../src/reports/reports.service';
import { AccessService } from '../../src/common/access.service';
import { AdminService } from '../../src/admin/admin.service';

const actor = { id: 4, role: 'LEADER', coffeeShopAssignments: [{ coffeeShopId: 7 }] };
const metric = {
  id: 1, name: 'eNPS', code: 'ENPS', unit: '%', direction: 'HIGHER_IS_BETTER',
  thresholdStrong: 95, thresholdMedium: 80, pointsStrong: 11.5, pointsMedium: 5.75,
  pointsCritical: 0, isActive: true,
};
const questions = [
  { questionKey: 'enps_problems', section: 'ENPS', label: 'Проблемы' },
  { questionKey: 'enps_plan', section: 'ENPS', label: 'План устранения' },
];

function setup(absoluteValue: number, analyses: { questionKey: string; content: string }[] = []) {
  const report: any = {
    id: 51, coffeeShopId: 7, year: 2026, month: 10, isLocked: false,
    status: 'NOT_FILLED', revenue: 1000, drinksCount: 5000, formData: {},
    metricValues: [{ metricId: 1, absoluteValue }], analyses,
  };
  const prisma: any = {
    coffeeShop: { findUnique: jest.fn().mockResolvedValue({ id: 7, cityId: 2, isActive: true }) },
    monthlyReport: {
      findUnique: jest.fn().mockResolvedValue(report),
      findUniqueOrThrow: jest.fn().mockResolvedValue(report),
      update: jest.fn(async ({ data }) => ({ ...report, ...data })),
    },
    metric: { findMany: jest.fn().mockResolvedValue([metric]) },
    analysisQuestion: { findMany: jest.fn().mockResolvedValue(questions) },
    reportEditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (work) => work(prisma)),
  };
  const config = { get: jest.fn((key: string) => key === 'ALLOW_HISTORICAL_REPORT_EDITING' ? 'true' : undefined) };
  const service = new ReportsService(prisma, new AccessService(prisma), config as unknown as ConfigService);
  return { service, prisma };
}

describe('report analysis requirements', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-20T12:00:00Z')); });
  afterEach(() => jest.useRealTimers());

  it.each([
    { value: 70, zone: 'CRITICAL' },
    { value: 85, zone: 'BELOW_TARGET' },
  ])('requires every linked analysis when eNPS is in $zone zone', async ({ value }) => {
    const { service, prisma } = setup(value);

    await expect(service.submitReport(51, actor)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Проблемы'),
    });
    expect(prisma.monthlyReport.update).not.toHaveBeenCalled();
  });

  it('rejects linked comments shorter than three trimmed characters', async () => {
    const { service } = setup(85, [
      { questionKey: 'enps_problems', content: 'OK ' },
      { questionKey: 'enps_plan', content: 'План' },
    ]);

    await expect(service.submitReport(51, actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires all questions linked to the same red metric', async () => {
    const { service } = setup(70, [{ questionKey: 'enps_problems', content: 'Причины разобраны' }]);

    await expect(service.submitReport(51, actor)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('План устранения'),
    });
  });

  it('allows empty linked analyses when the metric is green', async () => {
    const { service, prisma } = setup(95);

    const result = await service.submitReport(51, actor);

    expect(result.status).toBe('SUBMITTED');
    expect(prisma.monthlyReport.update).toHaveBeenCalledTimes(1);
  });

  it('exposes each analysis question’s linked metric codes to the report form', async () => {
    const prisma: any = { analysisQuestion: { findMany: jest.fn().mockResolvedValue([
      { questionKey: 'reviews_speed', section: 'REVIEWS', label: 'Скорость разбора' },
      { questionKey: 'reviews_root_causes', section: 'REVIEWS', label: 'Корневые причины' },
      { questionKey: 'labor_performance', section: 'LABOR_COST', label: 'Производительность' },
      { questionKey: 'labor_hypothesis', section: 'LABOR_COST', label: 'Гипотеза' },
      { questionKey: 'gifts_top_reasons', section: 'GIFTS', label: 'Подарки' },
    ]) } };
    const service = new AdminService(prisma);

    await expect(service.getAnalysisQuestions()).resolves.toEqual([
      { questionKey: 'reviews_speed', section: 'REVIEWS', label: 'Скорость разбора', metricCodes: ['REVIEW_SPEED'] },
      { questionKey: 'reviews_root_causes', section: 'REVIEWS', label: 'Корневые причины', metricCodes: ['REVIEW_RATING'] },
      { questionKey: 'labor_performance', section: 'LABOR_COST', label: 'Производительность', metricCodes: ['PERFORMANCE'] },
      { questionKey: 'labor_hypothesis', section: 'LABOR_COST', label: 'Гипотеза', metricCodes: ['LABOR_COST'] },
      { questionKey: 'gifts_top_reasons', section: 'GIFTS', label: 'Подарки', metricCodes: [] },
    ]);
  });
});
