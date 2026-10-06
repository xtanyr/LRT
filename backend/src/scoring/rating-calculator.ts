export type MetricDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
export type MetricZone = 'TARGET' | 'BELOW_TARGET' | 'CRITICAL';

type NumericValue = number | string | { toString(): string };

export interface ScoringMetric {
  id: number;
  name: string;
  code: string;
  unit: string;
  direction: MetricDirection;
  thresholdStrong: NumericValue;
  thresholdMedium: NumericValue;
  pointsStrong: NumericValue;
  pointsMedium: NumericValue;
  pointsCritical?: NumericValue | null;
}

export interface ScoringReport {
  revenue: NumericValue;
  drinksCount?: number | null;
  metricValues: Array<{
    metricId: number;
    absoluteValue: NumericValue | null;
  }>;
}

export interface MetricScoreResult {
  metricId: number;
  metricName: string;
  code: string;
  unit: string;
  absoluteValue: number | null;
  computedPercent: number | null;
  zone: MetricZone | null;
  pointsAwarded: number | null;
  thresholdStrong: number;
  thresholdMedium: number;
  pointsStrong: number;
  pointsMedium: number;
  pointsCritical: number;
}

export interface ScoringResult {
  rating: number;
  totalPoints: number;
  maxPoints: number;
  results: MetricScoreResult[];
}

const REVENUE_SHARE_CODES = new Set([
  'LABOR_COST',
  'DESSERT_WRITEOFF',
  'PRODUCT_WRITEOFF',
  'FREE_ACCESS',
  'DEPOSIT',
]);

function asNumber(value: NumericValue): number {
  return typeof value === 'number' ? value : Number(value.toString());
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function performanceThresholds(drinksCount: number | null | undefined) {
  if (drinksCount == null) return null;
  if (drinksCount >= 13_000) return { strong: 11, medium: 8.5 };
  if (drinksCount >= 10_000) return { strong: 8.5, medium: 7.5 };
  if (drinksCount >= 7_000) return { strong: 7.5, medium: 6.2 };
  return { strong: 6.2, medium: 4 };
}

function classify(
  value: number,
  direction: MetricDirection,
  thresholdStrong: number,
  thresholdMedium: number,
): MetricZone {
  if (direction === 'HIGHER_IS_BETTER') {
    if (value >= thresholdStrong) return 'TARGET';
    if (value >= thresholdMedium) return 'BELOW_TARGET';
    return 'CRITICAL';
  }

  if (value <= thresholdStrong) return 'TARGET';
  if (value <= thresholdMedium) return 'BELOW_TARGET';
  return 'CRITICAL';
}

export function calculateScore(metrics: ScoringMetric[], report: ScoringReport): ScoringResult {
  let totalPoints = 0;
  let maxPoints = 0;

  const results = metrics.map((metric): MetricScoreResult => {
    const pointsStrong = asNumber(metric.pointsStrong);
    const pointsMedium = asNumber(metric.pointsMedium);
    const pointsCritical = metric.pointsCritical == null ? 0 : asNumber(metric.pointsCritical);
    maxPoints += pointsStrong;

    const performance = metric.code === 'PERFORMANCE'
      ? performanceThresholds(report.drinksCount)
      : undefined;
    const thresholdStrong = performance?.strong ?? asNumber(metric.thresholdStrong);
    const thresholdMedium = performance?.medium ?? asNumber(metric.thresholdMedium);
    const metricValue = report.metricValues.find((value) => value.metricId === metric.id);
    const absoluteValue = metricValue?.absoluteValue == null ? null : asNumber(metricValue.absoluteValue);

    let computedPercent: number | null = null;
    let scoreValue = absoluteValue != null && absoluteValue < 0 ? null : absoluteValue;
    let zone: MetricZone | null = null;
    let pointsAwarded: number | null = null;

    const cannotScorePerformance = metric.code === 'PERFORMANCE' && performance === null;
    if (scoreValue != null && !cannotScorePerformance) {
      if (REVENUE_SHARE_CODES.has(metric.code)) {
        const revenue = asNumber(report.revenue);
        if (revenue > 0) {
          const ratio = (scoreValue / revenue) * 100;
          computedPercent = round(ratio);
          scoreValue = ratio;
        } else {
          scoreValue = null;
        }
      }

      if (scoreValue != null) {
        zone = classify(scoreValue, metric.direction, thresholdStrong, thresholdMedium);
        pointsAwarded = zone === 'TARGET'
          ? pointsStrong
          : zone === 'BELOW_TARGET'
            ? pointsMedium
            : pointsCritical;
        totalPoints += pointsAwarded;
      }
    }

    return {
      metricId: metric.id,
      metricName: metric.name,
      code: metric.code,
      unit: metric.unit,
      absoluteValue,
      computedPercent,
      zone,
      pointsAwarded,
      thresholdStrong,
      thresholdMedium,
      pointsStrong,
      pointsMedium,
      pointsCritical,
    };
  });

  const rating = round(totalPoints);
  return {
    rating,
    totalPoints: rating,
    maxPoints: round(maxPoints),
    results,
  };
}
