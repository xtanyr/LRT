export interface TriggerReport {
  year: number; month: number; status: string;
  ratingSnapshot: any;
}
export function triggerWindow(reports: TriggerReport[], monthsCount: number, endYear: number, endMonth: number) {
  if (!Number.isInteger(monthsCount) || monthsCount < 1 || monthsCount > 36) return [];
  const end = endYear * 12 + endMonth - 1;
  return Array.from({ length: monthsCount }, (_, index) => {
    const period = end - monthsCount + 1 + index;
    return {
      year: Math.floor(period / 12), month: period % 12 + 1,
      report: reports.find(report => report.year * 12 + report.month - 1 === period && report.status === 'SUBMITTED'),
    };
  });
}
export function triggerMatch(reports: TriggerReport[], config: {code: string; monthsCount: number; thresholdRating: unknown}, endYear: number, endMonth: number): {metricId: number | null} | null {
  if (!['T1', 'T2', 'T3'].includes(config.code)) return null;
  const window: TriggerReport[] = [];
  for (const { report } of triggerWindow(reports, config.monthsCount, endYear, endMonth)) {
    if (!report?.ratingSnapshot || !Number.isFinite(report.ratingSnapshot.rating)) return null;
    window.push(report);
  }
  if (!window.length) return null;
  if (config.code === 'T3') {
    const critical = Array.isArray(window[0].ratingSnapshot.results) ? window[0].ratingSnapshot.results.filter((r: any) => r?.zone === 'CRITICAL' && Number.isInteger(r.metricId) && r.metricId > 0).sort((a: any, b: any) => a.metricId - b.metricId) : [];
    const common = critical.find((r: any) => window.every(w => Array.isArray(w.ratingSnapshot.results) && w.ratingSnapshot.results.some((v: any) => v?.metricId === r.metricId && v.zone === 'CRITICAL')));
    return common ? {metricId: common.metricId} : null;
  }
  const ratings = window.map(r => r.ratingSnapshot.rating as number);
  if (!ratings.every(r => r < Number(config.thresholdRating))) return null;
  if (config.code === 'T1' && ratings.some((r, i) => i > 0 && r > ratings[i - 1])) return null;
  return {metricId: null};
}
export function monthsOld(date: Date | null, minimum: number, now: Date): boolean {
  if (!date) return minimum === 0;
  const offset = 3 * 60 * 60 * 1000;
  const moscow = new Date(now.getTime() + offset);
  const cutoff = new Date(moscow);
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - minimum);
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(moscow.getUTCDate(), lastDay));
  return date.getTime() <= cutoff.getTime() - offset;
}
