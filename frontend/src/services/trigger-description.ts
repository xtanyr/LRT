export interface TriggerRule {
  code: string;
  thresholdRating: number | string | null;
  monthsCount: number;
}

export function triggerDescription(rule: TriggerRule): string {
  if (rule.code === 'T3') return `Одна и та же метрика в красной зоне ${rule.monthsCount} мес. подряд.`;
  const rating = `Рейтинг ниже ${rule.thresholdRating ?? '—'} в течение ${rule.monthsCount} мес. подряд`;
  if (rule.code === 'T1') return `${rating}, без роста.`;
  if (rule.code === 'T2') return `${rating}.`;
  return `Правило ${rule.code}`;
}
