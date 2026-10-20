import { AnalysisSection } from '@prisma/client';

const sectionMetricCodes: Partial<Record<AnalysisSection, string[]>> = {
  [AnalysisSection.ENPS]: ['ENPS'],
  [AnalysisSection.REVIEWS]: ['REVIEW_RATING'],
  [AnalysisSection.GUEST_EXPERIENCE]: ['GUEST_EXP'],
  [AnalysisSection.STANDARDS]: ['STANDARDS'],
  [AnalysisSection.LABOR_COST]: ['LABOR_COST'],
  [AnalysisSection.DESSERT_WRITEOFF]: ['DESSERT_WRITEOFF'],
  [AnalysisSection.PRODUCT_WRITEOFF]: ['PRODUCT_WRITEOFF'],
  [AnalysisSection.FREE_ACCESS]: ['FREE_ACCESS'],
};

const questionMetricCodes: Record<string, string[]> = {
  reviews_speed: ['REVIEW_SPEED'],
  labor_performance: ['PERFORMANCE'],
};

export function metricCodesForAnalysisQuestion(question: { questionKey: string; section: AnalysisSection }): string[] {
  return questionMetricCodes[question.questionKey] ?? sectionMetricCodes[question.section] ?? [];
}
