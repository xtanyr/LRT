import { NotificationsService } from '../../src/notifications/notifications.service';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { AccessService } from '../../src/common/access.service';

describe('Manual trigger exclusion hides saved indicators', () => {
  let shop: any, statuses: any[], db: any, notifications: any[], service: NotificationsService;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T09:00:00Z'));
    shop = { id: 4, cityId: 7, city: { id: 7 }, assignments: [{ assignedFrom: new Date('2020-01-01'), assignedUntil: null, user: { id: 10, role: 'LEADER', approvedAt: new Date('2020-01-01'), exemptions: [{ id: 3, isActive: true, reason: 'Отпуск' }] } }] };
    statuses = [{ id: 8, coffeeShopId: 4, triggerCode: 'T1', status: 'NOT_STARTED', coffeeShop: shop }];
    notifications = [{ id: 1, userId: 2, ipvStatusId: 8, isRead: false }, { id: 2, userId: 2, ipvStatusId: null, isRead: false }, { id: 3, userId: 99, ipvStatusId: 8, isRead: false }];
    const matches = (row: any, where: any) => row.userId === where.userId && (where.isRead === undefined || row.isRead === where.isRead) && (where.ipvStatusId?.not === null ? row.ipvStatusId !== null : true) && (!where.OR || row.ipvStatusId === null || !where.OR[1].ipvStatusId.notIn.includes(row.ipvStatusId));
    db = {
      notification: {
        findMany: jest.fn(async ({ where, take }: any) => notifications.filter(row => matches(row, where)).slice(0, take ?? notifications.length)),
        count: jest.fn(async ({ where }: any) => notifications.filter(row => matches(row, where)).length),
        update: jest.fn(), updateMany: jest.fn(),
      },
      iPVStatus: { findMany: jest.fn(async ({ where }: any) => statuses.filter(s => (!where.status || s.status === where.status) && (!where.id || where.id.in.includes(s.id)))) },
      coffeeShop: { findMany: jest.fn(async () => [shop]) },
      triggerConfig: { findMany: jest.fn(async () => [{ code: 'T1', thresholdRating: 60, monthsCount: 3, minMonthsOnPosition: 6, minMonthsSinceApproval: 6, isActive: true }]) },
    };
    service = new NotificationsService(db);
  });
  afterEach(() => jest.useRealTimers());

  it('hides pending notifications and unread count without deleting or marking them read', async () => {
    expect((await service.getNotifications(2)).map(n => n.id)).toEqual([2]);
    expect(await service.getUnreadCount(2)).toBe(1);
    expect(db.notification.update).not.toHaveBeenCalled();
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });

  it('restores the original notification and count after the flag is cleared', async () => {
    await service.getNotifications(2);
    shop.assignments[0].user.exemptions = [];
    expect((await service.getNotifications(2)).map(n => n.id)).toEqual([1, 2]);
    expect(await service.getUnreadCount(2)).toBe(2);
  });

  it('keeps a signal visible if another current leader has no exemption', async () => {
    shop.assignments.push({ ...shop.assignments[0], user: { ...shop.assignments[0].user, id: 11, exemptions: [] } });
    expect((await service.getNotifications(2)).map(n => n.id)).toEqual([1, 2]);
  });

  it('does not suppress in-progress notifications or those belonging to another user', async () => {
    statuses[0].status = 'IN_PROGRESS';
    expect((await service.getNotifications(2)).map(n => n.id)).toEqual([1, 2]);
    expect(await service.getUnreadCount(2)).toBe(2);
  });

  it('hides a flag when the other active leader is unapproved rather than eligible', async () => {
    shop.assignments.push({ ...shop.assignments[0], user: { ...shop.assignments[0].user, id: 11, approvedAt: null, exemptions: [] } });
    expect((await service.getNotifications(2)).map(n => n.id)).toEqual([2]);
    expect(await service.getUnreadCount(2)).toBe(1);
    shop.assignments[0].user.exemptions = [];
    expect(await service.getUnreadCount(2)).toBe(2);
  });

  it('hides pending dashboard badges while preserving in-progress and completed IPV', async () => {
    statuses.push({ ...statuses[0], id: 9, status: 'IN_PROGRESS' }, { ...statuses[0], id: 10, status: 'COMPLETED' });
    const dashboard = new DashboardService(db, new AccessService(db), { getReportsByUser: async () => [] } as any);
    const actor = { id: 2, role: 'CITY_LEADER', cityAssignments: [{ cityId: 7 }] };
    expect((await dashboard.getCityLeaderDashboard(actor)).ipvStatuses.map(s => s.id)).toEqual([9, 10]);
    shop.assignments[0].user.exemptions = [];
    expect((await dashboard.getCityLeaderDashboard(actor)).ipvStatuses.map(s => s.id)).toEqual([8, 9, 10]);
  });
});
