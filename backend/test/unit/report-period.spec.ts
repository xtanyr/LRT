import { latestClosedPeriod, reportPeriodState } from '../../src/common/report-period';

describe('Moscow report calendar', () => {
  it('closes the report at 09:00 Moscow time on the 10th of the following month', () => {
    expect(reportPeriodState(2026, 8, new Date('2026-09-10T05:59:59Z'))).toEqual({ locked: false });
    expect(reportPeriodState(2026, 8, new Date('2026-09-10T06:00:00Z'))).toEqual({ locked: true });
  });
  it('keeps the report open on the 9th', () => {
    expect(reportPeriodState(2026, 8, new Date('2026-09-09T21:00:00Z')).locked).toBe(false);
  });
  it('handles December rollover', () => {
    expect(reportPeriodState(2026, 12, new Date('2027-01-10T05:59:59Z')).locked).toBe(false);
    expect(reportPeriodState(2026, 12, new Date('2027-01-10T06:00:00Z')).locked).toBe(true);
  });
  it('rejects invalid month', () => { expect(() => reportPeriodState(2026, 13)).toThrow(); });

  it('picks the latest closed month', () => {
    expect(latestClosedPeriod(new Date('2026-11-10T05:59:59Z'))).toEqual({ year: 2026, month: 9 });
    expect(latestClosedPeriod(new Date('2026-11-10T06:00:00Z'))).toEqual({ year: 2026, month: 10 });
    expect(latestClosedPeriod(new Date('2026-11-30T12:00:00Z'))).toEqual({ year: 2026, month: 10 });
  });
  it('picks the latest closed month across the year boundary', () => {
    expect(latestClosedPeriod(new Date('2027-01-05T10:00:00Z'))).toEqual({ year: 2026, month: 11 });
    expect(latestClosedPeriod(new Date('2027-01-10T06:00:00Z'))).toEqual({ year: 2026, month: 12 });
  });
});
