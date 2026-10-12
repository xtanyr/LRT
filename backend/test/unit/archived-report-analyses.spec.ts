import { ReportsService } from '../../src/reports/reports.service';

function setup() {
  let report: any = {
    id: 51, coffeeShopId: 7, year: 2026, month: 9, isLocked: false, status: 'NOT_FILLED',
    revenue: 1000, drinksCount: 50, formData: {}, metricValues: [],
    analyses: [{ questionKey: 'old_question', content: 'Сохранённый ответ' }],
  };
  const questions = [
    { questionKey: 'old_question', isActive: false },
    { questionKey: 'current_question', isActive: true },
  ];
  const prisma: any = {
    monthlyReport: {
      findUnique: jest.fn(async () => report),
      findUniqueOrThrow: jest.fn(async () => report),
      upsert: jest.fn(async ({ update }) => { report = { ...report, ...update }; return report; }),
      update: jest.fn(async ({ data }) => { report = { ...report, ...data }; return report; }),
    },
    metric: { findMany: jest.fn().mockResolvedValue([]) },
    analysisQuestion: { findMany: jest.fn(async (query?: any) => questions.filter(
      question => query?.where?.isActive === undefined || question.isActive === query.where.isActive)) },
    reportAnalysis: { upsert: jest.fn(async ({ create }) => {
      report.analyses = [...report.analyses.filter((answer: any) => answer.questionKey !== create.questionKey),
        { questionKey: create.questionKey, content: create.content }];
    }) },
    reportEditLog: { create: jest.fn() },
    $transaction: jest.fn(async work => work(prisma)),
  };
  const access = { requireShop: jest.fn().mockResolvedValue({ id: 7, isActive: true }) };
  const service = new ReportsService(prisma, access as any, { get: jest.fn().mockReturnValue('true') } as any);
  return { service, prisma, current: () => report };
}

describe('Reports after archiving an analysis question', () => {
  const actor = { id: 4, role: 'LEADER' };

  it('saves a stale form while preserving the answer to an archived question', async () => {
    const { service, prisma, current } = setup();
    const saved = await service.createOrUpdateDraft({ ...current(), analyses: [
      { questionKey: 'old_question', content: 'Несохранённое изменение' },
      { questionKey: 'current_question', content: 'Актуальный ответ' },
    ] }, actor);

    expect(saved.analyses).toEqual([
      { questionKey: 'old_question', content: 'Сохранённый ответ' },
      { questionKey: 'current_question', content: 'Актуальный ответ' },
    ]);
    expect(prisma.reportEditLog.create.mock.calls.some(([input]: any[]) =>
      input.data.fieldChanged === 'analysis:old_question')).toBe(false);
  });

  it('continues rejecting unknown questions without writing the report', async () => {
    const { service, prisma, current } = setup();
    await expect(service.createOrUpdateDraft({ ...current(), analyses: [
      { questionKey: 'unknown_question', content: 'Ответ' },
    ] }, actor)).rejects.toMatchObject({ status: 400 });

    expect(prisma.monthlyReport.upsert).not.toHaveBeenCalled();
  });
});
