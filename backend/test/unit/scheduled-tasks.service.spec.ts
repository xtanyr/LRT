import { ScheduledTasksService } from '../../src/common/jobs/scheduled-tasks.service';

function setup() {
  const db: any = {
    metric: { findMany: jest.fn().mockResolvedValue([]) },
    monthlyReport: {
      findMany: jest.fn().mockResolvedValue([{ id: 7, year: 2026, month: 10, status: 'NOT_FILLED', metricValues: [] }]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    coffeeShop: { findMany: jest.fn().mockResolvedValue([{ id: 21 }]) },
  };
  return { db, service: new ScheduledTasksService(db) };
}

describe('Report closing job: reports are only ever submitted manually', () => {
  it('does not touch the previous month before 09:00 Moscow on the 10th', async () => {
    const { db, service } = setup();
    await service.handleCloseReports(new Date('2026-11-10T05:59:59Z'));
    expect(db.monthlyReport.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ month: 10 }) }));
  });

  it('never submits an unfinished report after the deadline', async () => {
    const { db, service } = setup();
    await service.handleCloseReports(new Date('2026-11-10T06:00:00Z'));
    expect(db.monthlyReport.update).not.toHaveBeenCalled();
    expect(db.monthlyReport.findMany).not.toHaveBeenCalled();
    for (const [arg] of db.monthlyReport.updateMany.mock.calls) {
      expect(arg.data.status).toBeUndefined();
      expect(arg.where.status).toBe('SUBMITTED');
    }
  });

  it('never creates an empty submitted report for a shop without a report', async () => {
    const { db, service } = setup();
    await service.handleCloseReports(new Date('2026-11-10T06:00:00Z'));
    expect(db.monthlyReport.create).not.toHaveBeenCalled();
    expect(db.coffeeShop.findMany).not.toHaveBeenCalled();
  });

  it('still locks reports that were already submitted by a person', async () => {
    const { db, service } = setup();
    await service.handleCloseReports(new Date('2026-11-10T06:00:00Z'));
    expect(db.monthlyReport.updateMany).toHaveBeenCalledWith({ where: { year: 2026, month: 10, status: 'SUBMITTED', isLocked: false }, data: { isLocked: true } });
  });
});
