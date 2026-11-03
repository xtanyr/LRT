import { BadRequestException } from '@nestjs/common';

/**
 * Отчёт за месяц закрывается в 12:00 по Москве 11-го числа следующего месяца.
 * Europe/Moscow — UTC+3 без перехода на летнее время, поэтому 12:00 МСК = 09:00 UTC.
 * `month` — календарный номер месяца (1–12), поэтому Date.UTC(year, month, …) — следующий месяц.
 */
export function reportCloseAt(year: number, month: number) {
  return Date.UTC(year, month, 11, 9);
}

export function reportPeriodState(year: number, month: number, now = new Date()) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new BadRequestException('Некорректный отчётный период');
  }
  return { locked: now.getTime() >= reportCloseAt(year, month) };
}

export function previousReportingPeriod(now = new Date()) {
  const moscow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const date = new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth() - 1, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** Последний отчётный месяц, который к моменту `now` уже закрыт. */
export function latestClosedPeriod(now = new Date()) {
  const previous = previousReportingPeriod(now);
  if (now.getTime() >= reportCloseAt(previous.year, previous.month)) return previous;
  const date = new Date(Date.UTC(previous.year, previous.month - 2, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
