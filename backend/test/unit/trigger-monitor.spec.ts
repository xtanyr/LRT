import { TriggerMonitorService } from '../../src/ipv-triggers/trigger-monitor.service';

const now = new Date('2026-10-05T09:00:00Z');
const leader = (userId = 1, overrides: Record<string, unknown> = {}) => ({
  userId, assignedFrom: new Date('2025-01-01T00:00:00Z'), assignedUntil: null,
  user: { id: userId, role: 'LEADER', approvedAt: new Date('2025-01-01T00:00:00Z'), exemptions: [] },
  ...overrides,
});
const config = (code: 'T1' | 'T2' | 'T3', overrides: Record<string, unknown> = {}) => ({
  code, thresholdRating: code === 'T1' ? 60 : code === 'T2' ? 80 : 0,
  monthsCount: code === 'T2' ? 12 : 3, minMonthsOnPosition: 6, minMonthsSinceApproval: 6,
  isActive: true, ...overrides,
});
const report = (year: number, month: number, rating = 50, metricId = 7) => ({
  coffeeShopId: 1, year, month, status: 'SUBMITTED',
  ratingSnapshot: { rating, results: [{ metricId, zone: 'CRITICAL' }] },
});
const cityLeader = (userId: number, overrides: Record<string, unknown> = {}) => ({
  userId, assignedFrom: new Date('2025-01-01T00:00:00Z'), user: { role: 'CITY_LEADER' }, ...overrides,
});
function database(options: { assignments?: ReturnType<typeof leader>[]; cityAssignments?: ReturnType<typeof cityLeader>[]; configs?: ReturnType<typeof config>[]; reports?: ReturnType<typeof report>[]; statuses?: any[] } = {}) {
  const shops = [
    { id: 1, name: 'Первая', isActive: true, assignments: options.assignments ?? [leader()], city: { cityAssignments: options.cityAssignments ?? [cityLeader(20), cityLeader(20), cityLeader(21)] } },
    { id: 2, name: 'Вторая', isActive: true, assignments: [leader(2)], city: { cityAssignments: [cityLeader(22)] } },
  ];
  const configs = options.configs ?? [config('T1')];
  const rows = options.reports ?? [report(2026, 7), report(2026, 8), report(2026, 9)];
  const statuses = options.statuses ?? [];
  const notifications: any[] = [];
  const settings = new Map<string, string>();
  const matches = (value: any, where: any): boolean => Object.entries(where).every(([key, expected]: [string, any]) => {
    if (key === 'OR') return expected.some((condition: any) => matches(value, condition));
    if (expected && typeof expected === 'object' && 'not' in expected) return value[key] !== expected.not;
    if (expected && typeof expected === 'object' && 'in' in expected) return expected.in.includes(value[key]);
    if (expected && typeof expected === 'object' && 'lt' in expected) return value[key] < expected.lt;
    if (expected && typeof expected === 'object' && 'lte' in expected) return value[key] <= expected.lte;
    if (expected && typeof expected === 'object') return value[key] != null && matches(value[key], expected);
    return value[key] === expected;
  });
  const tx = {
    $executeRaw: jest.fn(async () => 1),
    iPVStatus: {
      findFirst: async ({ where }: any) => statuses.find(status => matches(status, where)) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const existing = statuses.find(status => matches(status, where.coffeeShopId_triggerCode));
        if (existing) { Object.assign(existing, update); return existing; }
        const status = { id: statuses.length + 1, status: 'NOT_STARTED', ...create };
        statuses.push(status); return status;
      },
    },
    systemSetting: {
      findUnique: async ({ where }: any) => settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null,
      create: async ({ data }: any) => { if (settings.has(data.key)) throw new Error('Duplicate event key'); settings.set(data.key, data.value); return data; },
    },
    notification: { create: async ({ data }: any) => { notifications.push(data); return data; } },
  };
  let tail = Promise.resolve();
  const prisma: any = {
    coffeeShop: { findMany: async ({ where, include }: any) => shops.filter(shop => matches(shop, where)).map(shop => {
      const recipients = include?.city?.include?.cityAssignments;
      return { ...shop, city: { ...shop.city, cityAssignments: recipients?.where ? shop.city.cityAssignments.filter(assignment => matches(assignment, recipients.where)) : shop.city.cityAssignments } };
    }) },
    triggerConfig: {
      findMany: async ({ where }: any = {}) => where ? configs.filter(row => matches(row, where)) : [...configs],
      upsert: async ({ where, create, update }: any) => {
        const existing = configs.find(row => row.code === where.code);
        if (existing) { Object.assign(existing, update); return existing; }
        configs.push(create); return create;
      },
    },
    monthlyReport: { findMany: async ({ where, take }: any) => rows.filter(row => matches(row, where)).sort((a, b) => b.year - a.year || b.month - a.month).slice(0, take) },
    $transaction: (work: any) => {
      const next = tail.then(() => work(tx)); tail = next.catch(() => undefined); return next;
    },
  };
  return { monitor: new TriggerMonitorService(prisma), statuses, notifications, settings, configs, rows, shops, tx };
}

describe('TriggerMonitorService with a transactional in-memory database', () => {
  it('ignores ended and future assignments that used to block a current eligible leader', async () => {
    const db = database({ assignments: [leader(), leader(2, { assignedUntil: new Date('2026-08-01'), user: { id: 2, role: 'LEADER', approvedAt: null, exemptions: [{ isActive: true }] } }), leader(3, { assignedFrom: new Date('2026-11-01'), user: { id: 3, role: 'LEADER', approvedAt: null, exemptions: [] } })] });
    await db.monitor.evaluate(now);
    expect(db.statuses.map(status => status.triggerCode)).toEqual(['T1']);
  });
  it('allows one eligible current leader even when another current leader is exempt or too new', async () => {
    const db = database({ assignments: [leader(), leader(2, { user: { id: 2, role: 'LEADER', approvedAt: null, exemptions: [{ isActive: true }] } }), leader(3, { assignedFrom: new Date('2026-09-01') })] });
    await db.monitor.evaluate(now);
    expect(db.statuses).toHaveLength(1);
  });
  it('creates simultaneous T1 and T3 pending events in stable order', async () => {
    const db = database({ configs: [config('T3'), config('T2'), config('T1')] });
    await db.monitor.evaluate(now);
    expect(db.statuses.map(status => [status.triggerCode, status.metricId, status.status])).toEqual([['T1', null, 'NOT_STARTED'], ['T3', 7, 'NOT_STARTED']]);
  });
  it('notifies each assigned city leader once across duplicate runs and concurrent evaluations', async () => {
    const db = database();
    await Promise.all([db.monitor.evaluate(now), db.monitor.evaluate(now)]);
    await db.monitor.evaluate(now);
    expect(db.statuses).toHaveLength(1);
    expect(db.notifications.map(notification => notification.userId)).toEqual([20, 21]);
    expect(db.settings.size).toBe(1);
    expect(db.tx.$executeRaw).toHaveBeenCalled();
  });
  it('notifies current city leaders but excludes former leaders and future city appointments', async () => {
    const db = database({ cityAssignments: [
      cityLeader(20), cityLeader(21, { assignedFrom: now }),
      cityLeader(22, { user: { role: 'COO' } }),
      cityLeader(23, { user: { role: 'LEADER' } }),
      cityLeader(24, { assignedFrom: new Date('2026-11-01T00:00:00Z') }),
    ] });
    await db.monitor.evaluate(now);
    expect(db.statuses).toHaveLength(1);
    expect(db.notifications.map(notification => notification.userId)).toEqual([20, 21]);
  });
  it('does not create any new event while an IPV is IN_PROGRESS', async () => {
    const db = database({ configs: [config('T1'), config('T3')], statuses: [{ id: 40, coffeeShopId: 1, triggerCode: 'T2', status: 'IN_PROGRESS' }] });
    await db.monitor.evaluate(now);
    expect(db.statuses).toEqual([{ id: 40, coffeeShopId: 1, triggerCode: 'T2', status: 'IN_PROGRESS' }]);
    expect(db.notifications).toHaveLength(0);
  });
  it('keeps a pending event unchanged but permits a different matching trigger', async () => {
    const db = database({ configs: [config('T1'), config('T3')], statuses: [{ id: 40, coffeeShopId: 1, triggerCode: 'T1', status: 'NOT_STARTED', triggeredAt: new Date('2026-09-01') }] });
    await db.monitor.evaluate(now);
    expect(db.statuses.map(status => status.triggerCode)).toEqual(['T1', 'T3']);
    expect(db.statuses[0].triggeredAt).toEqual(new Date('2026-09-01'));
  });
  it('reopens completed IPV only for a new report window and resets workflow metadata', async () => {
    const db = database();
    await db.monitor.evaluate(now);
    Object.assign(db.statuses[0], { status: 'COMPLETED', statusChangedBy: 20, statusChangedAt: now });
    await db.monitor.evaluate(now);
    expect(db.statuses[0].status).toBe('COMPLETED');
    db.rows.push(report(2026, 10));
    await db.monitor.evaluate(new Date('2026-11-05T09:00:00Z'));
    expect(db.statuses[0]).toMatchObject({ status: 'NOT_STARTED', statusChangedBy: null, statusChangedAt: null, triggeredAt: new Date('2026-11-05T09:00:00Z') });
    expect(db.notifications).toHaveLength(4);
  });
  it('runs T2 over twelve consecutive submitted months and does not exempt growth', async () => {
    const rows = [report(2025, 10, 0), report(2025, 11, 10), report(2025, 12, 20), ...Array.from({ length: 9 }, (_, index) => report(2026, index + 1, 20 + index * 5))];
    const db = database({ configs: [config('T2')], reports: rows });
    await db.monitor.evaluate(now);
    expect(db.statuses.map(status => status.triggerCode)).toEqual(['T2']);
    const missing = database({ configs: [config('T2')], reports: rows.filter(row => row.year !== 2025 || row.month !== 12) });
    await missing.monitor.evaluate(now);
    expect(missing.statuses).toHaveLength(0);
  });
  it('does not let a current submitted report evict the oldest report of a configured 36-month window', async () => {
    const rows = Array.from({ length: 36 }, (_, index) => {
      const period = 2023 * 12 + 9 + index;
      return report(Math.floor(period / 12), period % 12 + 1);
    });
    const db = database({ configs: [config('T2', { monthsCount: 36 })], reports: [...rows, report(2026, 10)] });
    await db.monitor.evaluate(now);
    expect(db.statuses.map(status => status.triggerCode)).toEqual(['T2']);
  });
  it.each([
    ['missing approval', { assignments: [leader(1, { user: { id: 1, role: 'LEADER', approvedAt: null, exemptions: [] } })] }],
    ['active exemption', { assignments: [leader(1, { user: { id: 1, role: 'LEADER', approvedAt: new Date('2025-01-01'), exemptions: [{ isActive: true }] } })] }],
    ['no active assignment', { assignments: [leader(1, { assignedUntil: new Date('2026-01-01') })] }],
    ['disabled rule', { configs: [config('T1', { isActive: false })] }],
    ['T1 growth', { reports: [report(2026, 7, 45), report(2026, 8, 55), report(2026, 9, 50)] }],
    ['changing critical metrics', { configs: [config('T3')], reports: [report(2026, 7, 90, 1), report(2026, 8, 90, 2), report(2026, 9, 90, 3)] }],
  ])('does not generate events for %s', async (_description, options) => {
    const db = database(options);
    await db.monitor.evaluate(now);
    expect(db.statuses).toHaveLength(0);
    expect(db.notifications).toHaveLength(0);
  });
  it('limits an explicit evaluation to the requested coffee shop', async () => {
    const db = database({ reports: [report(2026, 7), report(2026, 8), report(2026, 9), ...[7, 8, 9].map(month => ({ ...report(2026, month), coffeeShopId: 2 }))] });
    await (db.monitor.evaluate as any)(now, [2]);
    expect(db.statuses.map(status => status.coffeeShopId)).toEqual([2]);
  });
  it('initializes missing defaults without overwriting edited or disabled rules', async () => {
    const db = database({ configs: [config('T1', { thresholdRating: 45, monthsCount: 5, isActive: false })] });
    await (db.monitor as any).onModuleInit();
    expect(db.configs.find(row => row.code === 'T1')).toMatchObject({ thresholdRating: 45, monthsCount: 5, isActive: false });
    expect(db.configs.find(row => row.code === 'T2')).toMatchObject({ thresholdRating: 80, monthsCount: 12, minMonthsOnPosition: 6, minMonthsSinceApproval: 6 });
    expect(db.configs.find(row => row.code === 'T3')).toMatchObject({ monthsCount: 3 });
  });
});
