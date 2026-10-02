import { ReportsService } from '../../src/reports/reports.service';

describe('Report mutation rules', () => {
  function setup(report: any) {
    const prisma = {
      monthlyReport: { findUnique: jest.fn().mockResolvedValue(report), upsert: jest.fn().mockResolvedValue(report) },
      coffeeShop: { findUnique: jest.fn().mockResolvedValue({ id: 1, isActive: true }) },
      metric: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const access = { requireShop: jest.fn().mockResolvedValue({ id: 1, isActive: true }), requireReport: jest.fn().mockResolvedValue(report) };
    const service = new (ReportsService as any)(prisma, access, { get: jest.fn().mockReturnValue('false') });
    return { service, prisma };
  }
  const actor = { id: 1, role: 'LEADER' };
  it('cannot bypass locked history through the draft endpoint', async () => {
    const { service, prisma } = setup({ id: 1, year: 2026, month: 1, isLocked: true });
    await expect(service.createOrUpdateDraft({ coffeeShopId: 1, year: 2026, month: 1, revenue: 100 }, actor)).rejects.toThrow();
    expect(prisma.monthlyReport.upsert).not.toHaveBeenCalled();
  });
  it('rejects invalid revenue rather than accepting a numeric prefix', async () => {
    const { service } = setup(null);
    await expect(service.createOrUpdateDraft({ coffeeShopId: 1, year: 2026, month: 9, revenue: '123abc' }, actor)).rejects.toThrow();
  });
  it('refuses submit of an incomplete report', async () => {
    const { service } = setup({ id: 1, year: 2026, month: 9, isLocked: false, revenue: 0, metricValues: [], analyses: [] });
    await expect(service.submitReport(1, actor)).rejects.toThrow();
  });
});
