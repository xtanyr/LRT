import { previousReportingPeriod } from '../common/report-period';
import { monthsOld, triggerMatch, TriggerReport, triggerWindow } from './trigger-rules';

export interface TriggerAssignment {
  assignedFrom: Date;
  assignedUntil: Date | null;
  user: { id?: number; name?: string; role: string; approvedAt: Date | null; exemptions: { isActive?: boolean; reason?: string }[] };
}
export interface TriggerConfiguration {
  code: string;
  thresholdRating: unknown;
  monthsCount: number;
  minMonthsOnPosition: number;
  minMonthsSinceApproval: number;
  isActive: boolean;
}
export interface TriggerCheck {
  code: string;
  isActive: boolean;
  eligible: boolean;
  matched: boolean;
  metricId: number | null;
  reasons: string[];
  windowStart: { year: number; month: number };
  windowEnd: { year: number; month: number };
}
export function getCurrentLeaders<T extends TriggerAssignment>(assignments: T[], now = new Date()): T[] {
  return assignments.filter(assignment => assignment.user.role === 'LEADER' && assignment.assignedFrom <= now && (!assignment.assignedUntil || assignment.assignedUntil > now));
}
export function evaluateShopTriggers<T extends TriggerAssignment>(assignments: T[], reports: TriggerReport[], configs: TriggerConfiguration[], now = new Date()): { leaders: T[]; checks: TriggerCheck[] } {
  const leaders = getCurrentLeaders(assignments, now);
  const windowEnd = previousReportingPeriod(now);
  const order = ['T1', 'T2', 'T3'];
  const checks = [...configs].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code)).map(config => {
    const window = triggerWindow(reports, config.monthsCount, windowEnd.year, windowEnd.month);
    const windowStart = window.length ? { year: window[0].year, month: window[0].month } : windowEnd;
    const check: TriggerCheck = { code: config.code, isActive: config.isActive, eligible: false, matched: false, metricId: null, reasons: [], windowStart, windowEnd };
    if (!config.isActive) check.reasons.push('Правило отключено');
    const reasons = leaders.map(assignment => {
      const blockers: string[] = [];
      for (const exemption of assignment.user.exemptions.filter(exemption => exemption.isActive !== false)) blockers.push(`Активное исключение${exemption.reason ? ': ' + exemption.reason : ''}`);
      if (!monthsOld(assignment.assignedFrom, config.minMonthsOnPosition, now)) blockers.push(`Стаж на кофейне менее ${config.minMonthsOnPosition} мес.`);
      if (!assignment.user.approvedAt && config.minMonthsSinceApproval > 0) blockers.push('Не указана дата утверждения лидера');
      else if (!monthsOld(assignment.user.approvedAt, config.minMonthsSinceApproval, now)) blockers.push(`После утверждения прошло менее ${config.minMonthsSinceApproval} мес.`);
      return blockers;
    });
    check.eligible = reasons.some(blockers => blockers.length === 0);
    if (!leaders.length) check.reasons.push('Нет действующего назначения лидера на кофейню');
    else if (!check.eligible) reasons.forEach((blockers, index) => {
      const prefix = leaders.length > 1 ? `${leaders[index].user.name || 'Лидер ' + (leaders[index].user.id ?? index + 1)}: ` : '';
      blockers.forEach(reason => check.reasons.push(prefix + reason));
    });
    if (!check.eligible || !config.isActive) return check;
    if (!window.length) { check.reasons.push('Некорректное число месяцев в правиле'); return check; }
    const periodLabel = ({ year, month }: { year: number; month: number }) => `${String(month).padStart(2, '0')}.${year}`;
    const missing = window.filter(period => !period.report);
    if (missing.length) { check.reasons.push(`Нет отправленных отчётов за ${missing.map(periodLabel).join(', ')}`); return check; }
    const unavailable = window.filter(period => !period.report?.ratingSnapshot || !Number.isFinite(period.report.ratingSnapshot.rating));
    if (unavailable.length) { check.reasons.push(`Нет сохранённого рейтинга за ${unavailable.map(periodLabel).join(', ')}`); return check; }
    const match = triggerMatch(reports, config, windowEnd.year, windowEnd.month);
    if (match) { check.matched = true; check.metricId = match.metricId; return check; }
    if (config.code === 'T3') check.reasons.push('Нет одной и той же метрики в красной зоне во всех месяцах окна');
    else {
      const ratings = window.map(period => period.report!.ratingSnapshot.rating as number);
      if (!ratings.every(rating => rating < Number(config.thresholdRating))) check.reasons.push(`Рейтинг должен быть ниже ${Number(config.thresholdRating)} во всех месяцах окна`);
      if (config.code === 'T1' && ratings.some((rating, index) => index > 0 && rating > ratings[index - 1])) check.reasons.push('Рост рейтинга внутри окна отменяет T1');
      if (!check.reasons.length) check.reasons.push('Условия правила не выполнены');
    }
    return check;
  });
  return { leaders, checks };
}
