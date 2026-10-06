import { evaluateShopTriggers, getCurrentLeaders } from '../../src/ipv-triggers/trigger-evaluation';

const now = new Date('2026-10-05T09:00:00Z');
const assignment = (overrides: Record<string, unknown> = {}) => ({
  assignedFrom: new Date('2025-01-01'), assignedUntil: null,
  user: { id: 1, role: 'LEADER', approvedAt: new Date('2025-01-01'), exemptions: [] }, ...overrides,
});
const t1 = { code: 'T1', thresholdRating: 60, monthsCount: 3, minMonthsOnPosition: 6, minMonthsSinceApproval: 6, isActive: true };
const rows = [7, 8, 9].map(month => ({ year: 2026, month, status: 'SUBMITTED', ratingSnapshot: { rating: 50, results: [{ metricId: 7, zone: 'CRITICAL' }] } }));

describe('shared trigger eligibility and diagnostic checks', () => {
  it('selects only current leaders, including start and excluding end boundaries', () => {
    const current = assignment();
    const boundary = assignment({ assignedFrom: now });
    expect(getCurrentLeaders([current, boundary, assignment({ assignedUntil: now }), assignment({ assignedFrom: new Date(now.getTime() + 1) }), assignment({ user: { id: 2, role: 'COO', approvedAt: now, exemptions: [] } })], now)).toEqual([current, boundary]);
  });
  it('returns the matched rule and the exact Moscow reporting window', () => {
    const result = evaluateShopTriggers([assignment()], rows, [t1], now);
    expect(result.checks).toEqual([{ code: 'T1', isActive: true, eligible: true, matched: true, metricId: null, reasons: [], windowStart: { year: 2026, month: 7 }, windowEnd: { year: 2026, month: 9 } }]);
  });
  it('uses the previous Moscow month at the UTC month boundary', () => {
    const result = evaluateShopTriggers([assignment()], rows, [t1], new Date('2026-09-30T21:00:00Z'));
    expect(result.checks[0].matched).toBe(true);
    expect(result.checks[0].windowEnd).toEqual({ year: 2026, month: 9 });
  });
  it('explains absent current assignment instead of including an old one', () => {
    const check = evaluateShopTriggers([assignment({ assignedUntil: new Date('2026-09-01') })], rows, [t1], now).checks[0];
    expect(check).toMatchObject({ eligible: false, matched: false });
    expect(check.reasons.join(' ')).toMatch(/нет действующего назначения/i);
  });
  it('explains absent approval without fabricating the approval date', () => {
    const check = evaluateShopTriggers([assignment({ user: { id: 1, role: 'LEADER', approvedAt: null, exemptions: [] } })], rows, [t1], now).checks[0];
    expect(check).toMatchObject({ eligible: false, matched: false });
    expect(check.reasons.join(' ')).toMatch(/не указана дата утверждения/i);
  });
  it('explains insufficient tenure and time since approval separately', () => {
    const check = evaluateShopTriggers([assignment({ assignedFrom: new Date('2026-05-01'), user: { id: 1, role: 'LEADER', approvedAt: new Date('2026-06-01'), exemptions: [] } })], rows, [t1], now).checks[0];
    expect(check.eligible).toBe(false);
    expect(check.reasons.join(' ')).toMatch(/стаж.*6 мес/i);
    expect(check.reasons.join(' ')).toMatch(/после утверждения.*6 мес/i);
  });
  it('explains active exemptions but permits a second eligible current leader', () => {
    const exempt = assignment({ user: { id: 1, role: 'LEADER', approvedAt: new Date('2025-01-01'), exemptions: [{ isActive: true, reason: 'Тестовое исключение' }] } });
    const check = evaluateShopTriggers([exempt], rows, [t1], now).checks[0];
    expect(check).toMatchObject({ eligible: false, matched: false });
    expect(check.reasons.join(' ')).toMatch(/исключение.*Тестовое исключение/i);
    expect(evaluateShopTriggers([exempt, assignment()], rows, [t1], now).checks[0].matched).toBe(true);
  });
  it('ignores cleared exemptions', () => {
    const cleared = assignment({ user: { id: 1, role: 'LEADER', approvedAt: new Date('2025-01-01'), exemptions: [{ isActive: false, reason: 'Снято' }] } });
    expect(evaluateShopTriggers([cleared], rows, [t1], now).checks[0].matched).toBe(true);
  });
  it('explains a disabled rule even when the submitted ratings match', () => {
    const check = evaluateShopTriggers([assignment()], rows, [{ ...t1, isActive: false }], now).checks[0];
    expect(check).toMatchObject({ isActive: false, matched: false });
    expect(check.reasons.join(' ')).toMatch(/правило отключено/i);
  });
  it('names the missing submitted months rather than silently returning no match', () => {
    const check = evaluateShopTriggers([assignment()], [rows[0], { ...rows[1], status: 'NOT_FILLED' }], [t1], now).checks[0];
    expect(check).toMatchObject({ eligible: true, matched: false });
    expect(check.reasons.join(' ')).toMatch(/отправлен.*08\.2026.*09\.2026/i);
  });
  it('explains an unavailable snapshot separately from an absent submitted report', () => {
    const check = evaluateShopTriggers([assignment()], [rows[0], { ...rows[1], ratingSnapshot: null }, rows[2]], [t1], now).checks[0];
    expect(check.matched).toBe(false);
    expect(check.reasons.join(' ')).toMatch(/сохранённ.*рейтинг.*08\.2026/i);
  });
  it('explains why growth cancels T1', () => {
    const check = evaluateShopTriggers([assignment()], rows.map((row, index) => ({ ...row, ratingSnapshot: { ...row.ratingSnapshot, rating: [45, 55, 50][index] } })), [t1], now).checks[0];
    expect(check.matched).toBe(false);
    expect(check.reasons.join(' ')).toMatch(/рост рейтинга/i);
  });
  it('explains ratings at or above the threshold without calling it growth', () => {
    const check = evaluateShopTriggers([assignment()], rows.map(row => ({ ...row, ratingSnapshot: { ...row.ratingSnapshot, rating: 60 } })), [t1], now).checks[0];
    expect(check.matched).toBe(false);
    expect(check.reasons.join(' ')).toMatch(/рейтинг.*ниже.*60/i);
  });
  it('identifies the common critical metric for T3 and explains its absence', () => {
    const t3 = { ...t1, code: 'T3', thresholdRating: 0 };
    expect(evaluateShopTriggers([assignment()], rows, [t3], now).checks[0]).toMatchObject({ matched: true, metricId: 7 });
    const changed = rows.map((row, index) => ({ ...row, ratingSnapshot: { ...row.ratingSnapshot, results: [{ metricId: index + 1, zone: 'CRITICAL' }] } }));
    const check = evaluateShopTriggers([assignment()], changed, [t3], now).checks[0];
    expect(check.matched).toBe(false);
    expect(check.reasons.join(' ')).toMatch(/одн.*метрик.*красной зоне/i);
  });
});
