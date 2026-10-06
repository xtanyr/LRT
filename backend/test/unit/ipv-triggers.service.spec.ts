import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccessService } from '../../src/common/access.service';
import { IpvTriggersService } from '../../src/ipv-triggers/ipv-triggers.service';

const now = new Date('2026-10-05T09:00:00Z');
const coo = { id: 1, role: 'COO' };
const cityLeader = { id: 2, role: 'CITY_LEADER', cityAssignments: [{ cityId: 7 }] };
const config = { id: 1, code: 'T1', thresholdRating: 60, monthsCount: 3, minMonthsOnPosition: 6, minMonthsSinceApproval: 6, isActive: true };
const assignment = (userId = 10, exemptions: any[] = [], dates = {}) => ({
  userId, coffeeShopId: 4, assignedFrom: new Date('2020-01-01'), assignedUntil: null,
  user: { id: userId, name: `Лидер ${userId}`, role: 'LEADER', approvedAt: new Date('2020-01-01'), exemptions, coffeeShopAssignments: [{ coffeeShop: { cityId: 7 } }] },
  ...dates,
});

describe('Trigger API service', () => {
  let db: any, service: IpvTriggersService, shop: any, monitor: any;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    shop = { id: 4, name: 'Кофейня', cityId: 7, city: { id: 7, name: 'Москва' }, assignments: [assignment()] };
    db = {
      coffeeShop: { findUnique: jest.fn(async () => shop), findMany: jest.fn(async () => [shop]) },
      triggerConfig: { findMany: jest.fn(async () => [config]), findUnique: jest.fn(async () => config), findUniqueOrThrow: jest.fn(async () => config), update: jest.fn(async ({ data }) => ({ id: 1, ...data })) },
      iPVStatus: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null), update: jest.fn(async ({ data }) => ({ id: 8, ...data })) },
      metric: { findMany: jest.fn(async () => [{ id: 12, name: 'Рейтинг стандартов' }]) },
      monthlyReport: { findMany: jest.fn(async () => []) },
      configChangeLog: { findMany: jest.fn(async () => []), create: jest.fn(async () => ({})) },
      notification: { updateMany: jest.fn(async () => ({ count: 1 })) },
      $executeRaw: jest.fn(async () => 1),
      user: { findUnique: jest.fn(async () => ({ id: 10, role: 'LEADER', coffeeShopAssignments: [assignment()] })) },
      triggerExemption: { findMany: jest.fn(async () => []), findUnique: jest.fn(), create: jest.fn(async ({ data }) => ({ id: 1, ...data })), update: jest.fn(async ({ data }) => ({ id: 1, ...data })) },
    };
    db.$transaction = async (callback: any) => callback(db);
    monitor = { evaluate: jest.fn(async () => undefined) };
    service = new IpvTriggersService(db, new AccessService(db), monitor);
  });
  afterEach(() => jest.useRealTimers());

  it('filters a shop-scoped list and enforces its access', async () => {
    await (service.getIpvStatuses as any)(cityLeader, '4');
    expect(db.iPVStatus.findMany.mock.calls[0][0].where).toMatchObject({ coffeeShopId: 4, coffeeShop: { cityId: { in: [7] } } });
    shop.cityId = 9;
    await expect((service.getIpvStatuses as any)(cityLeader, '4')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.iPVStatus.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns a T3 metric name and the last completion outcome', async () => {
    db.iPVStatus.findMany.mockResolvedValue([{ id: 8, coffeeShopId: 4, coffeeShop: shop, triggerCode: 'T3', metricId: 12, status: 'COMPLETED', triggeredAt: now }]);
    db.configChangeLog.findMany.mockResolvedValue([
      { fieldChanged: 'ipv:8', newValue: JSON.stringify({ status: 'COMPLETED', closeReason: 'Результат проверен' }) },
      { fieldChanged: 'ipv:8', newValue: JSON.stringify({ status: 'COMPLETED', closeReason: 'Предыдущий результат' }) },
    ]);
    const result = await service.getIpvStatuses(coo);
    expect(result[0]).toMatchObject({ metricName: 'Рейтинг стандартов', closeReason: 'Результат проверен', triggeredAt: now });
  });

  it('suppresses only pending signals, restoring them when an exemption is cleared', async () => {
    shop.assignments = [assignment(10, [{ id: 3, reason: 'Отпуск', isActive: true }])];
    const rows = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].map((status, id) => ({ id, coffeeShopId: 4, coffeeShop: shop, triggerCode: 'T1', status, triggeredAt: now }));
    db.iPVStatus.findMany.mockResolvedValue(rows);
    expect((await service.getIpvStatuses(coo)).map(r => r.status)).toEqual(['IN_PROGRESS', 'COMPLETED']);
    shop.assignments[0].user.exemptions = [];
    expect(await service.getIpvStatuses(coo)).toHaveLength(3);
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });

  it('ignores ended and future assignments when checking pending visibility', async () => {
    shop.assignments = [assignment(), assignment(11, [{ isActive: true }], { assignedUntil: new Date('2026-01-01') }), assignment(12, [{ isActive: true }], { assignedFrom: new Date('2027-01-01') })];
    db.iPVStatus.findMany.mockResolvedValue([{ id: 8, coffeeShop: shop, triggerCode: 'T1', status: 'NOT_STARTED', triggeredAt: now }]);
    expect(await service.getIpvStatuses(coo)).toHaveLength(1);
  });

  it('rejects starting a manually suppressed pending signal', async () => {
    shop.assignments = [assignment(10, [{ isActive: true }])];
    db.iPVStatus.findUnique.mockResolvedValue({ id: 8, coffeeShopId: 4, triggerCode: 'T1', status: 'NOT_STARTED', coffeeShop: shop });
    await expect(service.updateIpvStatus(8, { status: 'IN_PROGRESS' }, cityLeader)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.iPVStatus.update).not.toHaveBeenCalled();
  });

  it('requires pending → in progress → completed, persists the outcome and dismisses notification', async () => {
    db.iPVStatus.findUnique.mockResolvedValue({ id: 8, coffeeShopId: 4, triggerCode: 'T1', status: 'NOT_STARTED', coffeeShop: shop });
    await expect(service.updateIpvStatus(8, { status: 'COMPLETED', closeReason: 'Готово' }, cityLeader)).rejects.toBeInstanceOf(BadRequestException);
    await service.updateIpvStatus(8, { status: 'IN_PROGRESS' }, cityLeader);
    db.iPVStatus.findUnique.mockResolvedValue({ id: 8, coffeeShopId: 4, status: 'IN_PROGRESS', coffeeShop: shop });
    await expect(service.updateIpvStatus(8, { status: 'COMPLETED', closeReason: ' ' }, cityLeader)).rejects.toBeInstanceOf(BadRequestException);
    await service.updateIpvStatus(8, { status: 'COMPLETED', closeReason: ' Итог проверен ' }, cityLeader);
    expect(db.configChangeLog.create.mock.calls[1][0].data.newValue).toContain('"closeReason":"Итог проверен"');
    expect(db.notification.updateMany).toHaveBeenCalledTimes(2);
  });

  it('starts and completes simultaneous trigger reasons as one shop IPV', async () => {
    const rows = ['T1', 'T3'].map((triggerCode, index) => ({ id: 8 + index, coffeeShopId: 4, triggerCode, status: 'NOT_STARTED', coffeeShop: shop }));
    db.iPVStatus.findUnique.mockImplementation(async ({ where }: any) => rows.find(row => row.id === where.id));
    db.iPVStatus.findMany.mockImplementation(async ({ where }: any) => rows.filter(row => row.coffeeShopId === where.coffeeShopId && row.status === where.status));
    db.iPVStatus.update.mockImplementation(async ({ where, data }: any) => Object.assign(rows.find(row => row.id === where.id)!, data));
    await service.updateIpvStatus(8, { status: 'IN_PROGRESS' }, cityLeader);
    expect(rows.map(row => row.status)).toEqual(['IN_PROGRESS', 'IN_PROGRESS']);
    expect(db.notification.updateMany).toHaveBeenLastCalledWith({ where: { ipvStatusId: { in: [8, 9] } }, data: { isRead: true, readAt: now } });
    await expect(service.updateIpvStatus(9, { status: 'IN_PROGRESS' }, cityLeader)).rejects.toBeInstanceOf(BadRequestException);
    await service.updateIpvStatus(9, { status: 'COMPLETED', closeReason: 'Общий план выполнен' }, cityLeader);
    expect(rows.map(row => row.status)).toEqual(['COMPLETED', 'COMPLETED']);
    expect(db.configChangeLog.create.mock.calls.slice(0, 2).map((call: any[]) => call[0].data.fieldChanged).sort()).toEqual(['ipv:8', 'ipv:9']);
    expect(db.configChangeLog.create.mock.calls.slice(2).map((call: any[]) => call[0].data.fieldChanged).sort()).toEqual(['ipv:8', 'ipv:9']);
    expect(db.configChangeLog.create.mock.calls.slice(2).every((call: any[]) => call[0].data.newValue.includes('Общий план выполнен'))).toBe(true);
  });

  it.each([{}, [], { monthsCount: null }, { monthsCount: undefined }, { monthsCount: 0 }, { monthsCount: 1.5 }, { monthsCount: 37 }, { minMonthsOnPosition: 37 }, { isActive: 'false' }, { bogus: 1 }])('rejects invalid config %j', async data => {
    await expect(service.updateTriggerConfig(1, data, coo)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.triggerConfig.update).not.toHaveBeenCalled();
  });

  it('saves valid partial config and audit record', async () => {
    await service.updateTriggerConfig(1, { thresholdRating: 65, monthsCount: 4, minMonthsOnPosition: 0, isActive: false }, coo);
    expect(db.triggerConfig.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { thresholdRating: 65, monthsCount: 4, minMonthsOnPosition: 0, isActive: false } });
    expect(db.configChangeLog.create).toHaveBeenCalledTimes(1);
  });

  it('authorizes exceptions using current assignments, ignoring historical shops', async () => {
    db.user.findUnique.mockResolvedValue({ id: 10, role: 'LEADER', coffeeShopAssignments: [assignment(), { ...assignment(), coffeeShopId: 99, assignedUntil: new Date('2025-01-01') }] });
    db.coffeeShop.findUnique.mockImplementation(async ({ where }: any) => where.id === 4 ? shop : { id: 99, cityId: 9 });
    await expect(service.createExemption({ userId: 10, reason: 'Обоснованная причина' }, cityLeader)).resolves.toMatchObject({ userId: 10 });
  });

  it('only the author or a global manager can clear an exemption', async () => {
    db.triggerExemption.findUnique.mockResolvedValue({ id: 3, userId: 10, setById: 77 });
    await expect(service.clearExemption(3, cityLeader)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.clearExemption(3, coo)).resolves.toMatchObject({ isActive: false });
  });

  it('allows a global manager to clear a flag after a leader leaves their shop', async () => {
    db.user.findUnique.mockResolvedValue({ id: 10, role: 'LEADER', coffeeShopAssignments: [], exemptions: [] });
    db.triggerExemption.findUnique.mockResolvedValue({ id: 3, userId: 10, setById: 77 });
    await expect(service.clearExemption(3, coo)).resolves.toMatchObject({ isActive: false });
  });

  it('hides a flagged eligible leader signal when another active leader lacks approval', async () => {
    shop.assignments = [assignment(10, [{ id: 3, isActive: true }]), assignment(11)];
    shop.assignments[1].user.approvedAt = null;
    db.iPVStatus.findMany.mockResolvedValue([{ id: 8, coffeeShop: shop, triggerCode: 'T1', status: 'NOT_STARTED', triggeredAt: now }]);
    expect(await service.getIpvStatuses(coo)).toEqual([]);
    shop.assignments[0].user.exemptions = [];
    expect(await service.getIpvStatuses(coo)).toHaveLength(1);
  });

  it('hides pending signals for a disabled rule and restores them when enabled', async () => {
    db.triggerConfig.findMany.mockResolvedValue([{ ...config, isActive: false }]);
    db.iPVStatus.findMany.mockResolvedValue([{ id: 8, coffeeShop: shop, triggerCode: 'T1', status: 'NOT_STARTED', triggeredAt: now }]);
    expect(await service.getIpvStatuses(coo)).toEqual([]);
    db.triggerConfig.findMany.mockResolvedValue([config]);
    expect(await service.getIpvStatuses(coo)).toHaveLength(1);
  });

  it('returns exemption clear permission explicitly and scopes active assignments', async () => {
    const user = { id: 10, name: 'Лидер', coffeeShopAssignments: [{ coffeeShop: { cityId: 7 } }] };
    db.triggerExemption.findMany.mockResolvedValue([{ id: 3, setById: 2, user }, { id: 4, setById: 77, user }]);
    const rows = await service.getExemptions(cityLeader);
    expect(rows).toMatchObject([{ id: 3, canClear: true }, { id: 4, canClear: false }]);
    expect(db.triggerExemption.findMany.mock.calls[0][0].where.OR).toMatchObject([{setById:2},{user:{coffeeShopAssignments:{some:{ assignedFrom: { lte: now }, OR: [{ assignedUntil: null }, { assignedUntil: { gt: now } }] }}}}]);
  });

  it('keeps author permission when a leader changes cities or becomes unassigned', async () => {
    const user = { id: 10, name: 'Лидер', coffeeShopAssignments: [{ coffeeShop: { cityId: 7 } }, { coffeeShop: { cityId: 99 } }] };
    db.triggerExemption.findMany.mockResolvedValue([{ id: 3, setById: 2, user }]);
    expect((await service.getExemptions(cityLeader))[0].canClear).toBe(true);
    expect((await service.getExemptions(coo))[0].canClear).toBe(true);
    db.triggerExemption.findUnique.mockResolvedValue({ id: 3, userId: 10, setById: 2 });
    db.user.findUnique.mockResolvedValue({ id: 10, role: 'LEADER', coffeeShopAssignments: [] });
    await expect(service.clearExemption(3, cityLeader)).resolves.toMatchObject({ isActive: false });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('explains an unapproved current leader and hides historical assignments from diagnostics', async () => {
    shop.assignments[0].user.approvedAt = null;
    shop.assignments[0].user.exemptions = [{ id: 3, setById: 2, isActive: true, reason: 'Отпуск' }];
    shop.assignments.push(assignment(11, [], { assignedUntil: new Date('2025-01-01') }));
    db.triggerConfig.findMany.mockResolvedValue([{ code: 'T1', thresholdRating: 60, monthsCount: 3, minMonthsOnPosition: 6, minMonthsSinceApproval: 6, isActive: true }]);
    const result = await service.getDiagnostics(cityLeader, '4');
    expect(result).toHaveLength(1);
    expect(result[0].leaders).toMatchObject([{ id: 10, approvedAt: null, exemptions: [{ id: 3, canClear: true }] }]);
    expect(result[0].checks[0]).toMatchObject({ code: 'T1', eligible: false, matched: false, reasons: ['Активное исключение: Отпуск', 'Не указана дата утверждения лидера'], windowStart: { year: 2026, month: 7 }, windowEnd: { year: 2026, month: 9 } });
  });

  it('diagnostics limits reports to the previous period and explains a matching T1', async () => {
    db.triggerConfig.findMany.mockResolvedValue([{ code: 'T1', thresholdRating: 60, monthsCount: 3, minMonthsOnPosition: 6, minMonthsSinceApproval: 6, isActive: true }]);
    db.monthlyReport.findMany.mockResolvedValue([7, 8, 9].map(month => ({ year: 2026, month, status: 'SUBMITTED', ratingSnapshot: { rating: 50 } })));
    expect((await service.getDiagnostics(cityLeader))[0].checks[0]).toMatchObject({ eligible: true, matched: true, reasons: [] });
    expect(db.monthlyReport.findMany.mock.calls[0][0].where.OR).toEqual([{ year: { lt: 2026 } }, { year: 2026, month: { lte: 9 } }]);
    expect(db.coffeeShop.findMany.mock.calls[0][0].where).toMatchObject({ AND: [{ cityId: { in: [7] } }], isActive: true });
  });

  it('manual evaluation only evaluates accessible active shops', async () => {
    expect(await service.evaluateNow(cityLeader)).toEqual({ evaluatedAt: now });
    expect(db.coffeeShop.findMany.mock.calls[0][0].where).toEqual({ AND: [{ cityId: { in: [7] } }], isActive: true });
    expect(monitor.evaluate).toHaveBeenCalledWith(now, [4]);
  });

  it('rejects forbidden manual/diagnostic shop access before executing a monitor or query', async () => {
    shop.cityId = 99;
    await expect(service.evaluateNow(cityLeader, '4')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getDiagnostics(cityLeader, '4')).rejects.toBeInstanceOf(ForbiddenException);
    expect(monitor.evaluate).not.toHaveBeenCalled();
    expect(db.coffeeShop.findMany).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'NaN', '4.2', ''])('rejects malformed shop id %s', async id => {
    await expect(service.getIpvStatuses(cityLeader, id)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.iPVStatus.findMany).not.toHaveBeenCalled();
  });
});
