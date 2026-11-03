import { ScheduledTasksService } from '../../src/common/jobs/scheduled-tasks.service';

const metric = {
  id: 1, name: 'eNPS', code: 'ENPS', unit: '%', direction: 'HIGHER_IS_BETTER',
  thresholdStrong: 95, thresholdMedium: 80, pointsStrong: 11.5, pointsMedium: 5.75, pointsCritical: 0, isActive: true,
};

function setup(reports: any[], shops: any[] = []) {
  const db: any = {
    metric: { findMany: jest.fn().mockResolvedValue([metric]) },
    monthlyReport: {
      findMany: jest.fn().mockResolvedValue(reports),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    coffeeShop: { findMany: jest.fn().mockResolvedValue(shops) },
  };
  return { db, service: new ScheduledTasksService(db) };
}

describe('Automatic report closing', () => {
  it('does nothing before 12:00 Moscow on the 11th: the previous month is still open and older months are not touched', async () => {
    const { db, service } = setup([], [{ id: 21 }]);
    await service.handleCloseReports(new Date('2026-11-11T08:59:59Z'));
    expect(db.monthlyReport.findMany).not.toHaveBeenCalled();
    expect(db.monthlyReport.update).not.toHaveBeenCalled();
    expect(db.monthlyReport.create).not.toHaveBeenCalled();
  });

  it('submits and locks an unfinished report as is at 12:00 Moscow on the 11th', async () => {
    const { db, service } = setup([{ id: 7, year: 2026, month: 10, status: 'NOT_FILLED', revenue: 100, drinksCount: 5000, metricValues: [{ metricId: 1, absoluteValue: 96 }] }]);
    const now = new Date('2026-11-11T09:00:00Z');
    await service.handleCloseReports(now);
    expect(db.monthlyReport.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { year: 2026, month: 10, status: { not: 'SUBMITTED' } } }));
    expect(db.monthlyReport.update).toHaveBeenCalledTimes(1);
    const { where, data } = db.monthlyReport.update.mock.calls[0][0];
    expect(where).toEqual({ id: 7 });
    expect(data).toMatchObject({ status: 'SUBMITTED', isLocked: true, submittedAt: now });
    expect(data.ratingSnapshot).toMatchObject({ rating: 11.5, autoClosed: true });
  });

  it('gives 0 points for metrics that were not filled in', async () => {
    const { db, service } = setup([{ id: 8, year: 2026, month: 10, status: 'OVERDUE', revenue: 0, drinksCount: null, metricValues: [] }]);
    await service.handleCloseReports(new Date('2026-11-11T09:00:00Z'));
    expect(db.monthlyReport.update.mock.calls[0][0].data.ratingSnapshot).toMatchObject({ rating: 0, maxPoints: 11.5, autoClosed: true });
  });

  it('locks already submitted reports of the closed month', async () => {
    const { db, service } = setup([]);
    await service.handleCloseReports(new Date('2026-11-11T09:00:00Z'));
    expect(db.monthlyReport.updateMany).toHaveBeenCalledWith({ where: { year: 2026, month: 10, status: 'SUBMITTED', isLocked: false }, data: { isLocked: true } });
  });

  it('creates an empty submitted report with rating 0 for an assigned shop without a report', async () => {
    const { db, service } = setup([], [{ id: 21 }]);
    const now = new Date('2026-11-11T09:00:00Z');
    await service.handleCloseReports(now);
    expect(db.coffeeShop.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isActive: true, reports: { none: { year: 2026, month: 10 } } }) }));
    expect(db.monthlyReport.create).toHaveBeenCalledTimes(1);
    const { data } = db.monthlyReport.create.mock.calls[0][0];
    expect(data).toMatchObject({ coffeeShopId: 21, year: 2026, month: 10, revenue: 0, status: 'SUBMITTED', isLocked: true, submittedAt: now });
    expect(data.ratingSnapshot).toMatchObject({ rating: 0, autoClosed: true });
  });

  it('keeps closing other shops when one report cannot be created', async () => {
    const { db, service } = setup([], [{ id: 21 }, { id: 22 }]);
    db.monthlyReport.create.mockRejectedValueOnce(new Error('unique'));
    await service.handleCloseReports(new Date('2026-11-11T09:00:00Z'));
    expect(db.monthlyReport.create).toHaveBeenCalledTimes(2);
  });
});
