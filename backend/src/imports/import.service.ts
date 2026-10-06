import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildHistoricalPreview,
  FORM_FIELD_MAPPINGS,
  HistoricalFormData,
  HistoricalMetricRow,
  HistoricalPeriodPreview,
  HistoricalImportPreview,
  ImportMetricReference,
  ImportFormField,
} from './import-layout';
import { cleanNumericString } from './import.parser';

interface HistoricalConfirmPayload {
  coffeeShopId: number;
  sourceFile: string;
  overwriteExisting?: boolean;
  periods: HistoricalPeriodPreview[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCellReference(value: unknown): value is string {
  return typeof value === 'string' && /^[^!]+![A-Z]+[1-9]\d*$/.test(value);
}

function sanitizeFileName(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'historical-import.xlsx';
  return value.split(/[\\/]/).pop()!.slice(0, 255);
}

const TEXT_FORM_KEYS = new Set<string>(FORM_FIELD_MAPPINGS
  .map(([key]) => key)
  .filter((key) => key.endsWith('Analysis') || key.endsWith('Url') || key === 'summary'));

function negativeFormFields(formData: HistoricalFormData | null): ImportFormField[] {
  return (formData?.fields ?? []).filter((field) => {
    if (TEXT_FORM_KEYS.has(field.key)) return false;
    const value = typeof field.value === 'number'
      ? field.value
      : typeof field.value === 'string'
        ? cleanNumericString(field.value).value
        : null;
    return value != null && value < 0;
  });
}

function annotateNegativeValues(preview: HistoricalImportPreview): HistoricalImportPreview {
  for (const period of preview.periods) {
    for (const row of period.rows) {
      for (const [field, value] of [['absoluteValue', row.absoluteValue], ['computedPercent', row.computedPercent], ['sourcePoints', row.sourcePoints]] as const) {
        if (value == null || value >= 0) continue;
        const message = `${row.code}.${field} должно быть не меньше нуля`;
        row.issue = row.issue ? `${row.issue}; ${message}` : message;
        period.issues.push({
          severity: 'error',
          field,
          code: row.code,
          message,
          cell: field === 'sourcePoints' ? row.sourcePointsCell : row.sourceValueCell,
        });
        period.selected = false;
      }
    }
    for (const field of negativeFormFields(period.formData)) {
      period.issues.push({
        severity: 'error',
        field: field.key === 'revenue' ? 'revenue' : `formData:${field.key}`,
        message: `${field.label} должно быть не меньше нуля`,
        cell: field.sourceCell,
      });
      period.selected = false;
    }
  }
  return preview;
}

function validateRow(row: HistoricalMetricRow, periodLabel: string) {
  if (!Number.isInteger(row.metricId) || Number(row.metricId) <= 0 || !row.code || !row.metricName) {
    throw new BadRequestException(`${periodLabel}: каждая строка должна быть сопоставлена с метрикой`);
  }
  for (const [field, value] of [['absoluteValue', row.absoluteValue], ['computedPercent', row.computedPercent], ['sourcePoints', row.sourcePoints]] as const) {
    if (value != null && !isFiniteNumber(value)) {
      throw new BadRequestException(`${periodLabel}: ${row.code}.${field} должно быть числом или пустым значением`);
    }
    if (value != null && value < 0) {
      throw new BadRequestException(`${periodLabel}: ${row.code}.${field} должно быть не меньше нуля`);
    }
  }
  if (!isCellReference(row.sourceValueCell) || !isCellReference(row.sourcePointsCell)) {
    throw new BadRequestException(`${periodLabel}: для ${row.code} не указана ячейка-источник`);
  }
  if (!isFiniteNumber(row.sourcePointsStrong) || !isFiniteNumber(row.sourcePointsMedium)) {
    throw new BadRequestException(`${periodLabel}: для ${row.code} не сохранены исторические веса`);
  }
  if (row.issue) {
    throw new BadRequestException(`${periodLabel}: исправьте ${row.code}: ${row.issue}`);
  }
}

function validatePeriod(period: HistoricalPeriodPreview) {
  const label = `${period.year ?? '?'}-${period.month ?? '?'}`;
  if (!Number.isInteger(period.year) || Number(period.year) < 2000 || Number(period.year) > 2100) {
    throw new BadRequestException(`${label}: некорректный год`);
  }
  if (!Number.isInteger(period.month) || period.month < 1 || period.month > 12) {
    throw new BadRequestException(`${label}: некорректный месяц`);
  }
  if (!isFiniteNumber(period.revenue) || period.revenue < 0) {
    throw new BadRequestException(`${label}: укажите выручку числом не меньше нуля`);
  }
  if (period.drinksCount != null && (!Number.isInteger(period.drinksCount) || period.drinksCount < 0)) {
    throw new BadRequestException(`${label}: количество напитков должно быть целым числом не меньше нуля`);
  }
  if (!isFiniteNumber(period.sourceRating) || period.sourceRating < 0) {
    throw new BadRequestException(`${label}: исторический рейтинг отсутствует или некорректен`);
  }
  if (!isFiniteNumber(period.sourceMaxPoints) || period.sourceMaxPoints <= 0 || period.sourceRating > period.sourceMaxPoints) {
    throw new BadRequestException(`${label}: некорректен максимум исторического рейтинга`);
  }
  if (!isCellReference(period.sourceRatingCell) || typeof period.sourceSheet !== 'string' || !period.sourceSheet) {
    throw new BadRequestException(`${label}: не сохранён источник исторического рейтинга`);
  }
  if (!Array.isArray(period.rows) || period.rows.length === 0) {
    throw new BadRequestException(`${label}: нет строк метрик`);
  }
  for (const field of negativeFormFields(period.formData)) {
    if (field.key === 'revenue') continue;
    throw new BadRequestException(`${label}: ${field.label} должно быть не меньше нуля`);
  }
  if (period.issues?.some((issue) => issue.severity === 'error' && !(issue.field === 'revenue' && isFiniteNumber(period.revenue)))) {
    throw new BadRequestException(`${label}: в периоде остались неисправленные ошибки`);
  }
  const metricIds = new Set<number>();
  for (const row of period.rows) {
    validateRow(row, label);
    const metricId = Number(row.metricId);
    if (metricIds.has(metricId)) throw new BadRequestException(`${label}: метрика ${metricId} указана дважды`);
    metricIds.add(metricId);
  }
}

function zoneFor(row: HistoricalMetricRow) {
  if (row.sourcePoints == null) return null;
  if (Math.abs(row.sourcePoints - row.sourcePointsStrong) < 0.001) return 'TARGET';
  if (Math.abs(row.sourcePoints - row.sourcePointsMedium) < 0.001) return 'BELOW_TARGET';
  return 'CRITICAL';
}

function buildRatingSnapshot(period: HistoricalPeriodPreview, sourceFile: string) {
  return {
    rating: period.sourceRating,
    totalPoints: period.sourceRating,
    maxPoints: period.sourceMaxPoints,
    results: period.rows.map((row) => ({
      metricId: row.metricId,
      metricName: row.metricName,
      code: row.code,
      unit: row.unit,
      absoluteValue: row.absoluteValue,
      computedPercent: row.computedPercent,
      zone: zoneFor(row),
      pointsAwarded: row.sourcePoints,
      thresholdStrong: row.sourceThresholdStrong,
      thresholdMedium: row.sourceThresholdMedium,
      pointsStrong: row.sourcePointsStrong,
      pointsMedium: row.sourcePointsMedium,
      pointsCritical: 0,
      sourceValueCell: row.sourceValueCell,
      sourcePointsCell: row.sourcePointsCell,
      sourceFormula: row.sourceFormula ?? null,
    })),
    source: {
      kind: 'legacy-xlsx',
      fileName: sourceFile,
      sheetName: period.sourceSheet,
      ratingCell: period.sourceRatingCell,
      policy: 'preserve-source-score',
      historicalWeights: '4×13 + 5×9.6',
      currentReviewRatingExcluded: true,
    },
  };
}

function buildFormData(period: HistoricalPeriodPreview, sourceFile: string): HistoricalFormData & { importSource: object } {
  return {
    sourceSheet: period.formData?.sourceSheet ?? period.sourceSheet,
    fields: (period.formData?.fields ?? []).map((field) => field.key === 'revenue'
      ? { ...field, value: period.revenue }
      : field),
    importSource: {
      kind: 'legacy-xlsx',
      fileName: sourceFile,
      masterSheet: period.sourceSheet,
      year: period.year,
      month: period.month,
    },
  };
}

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  async previewImport(file: any, _userId: number): Promise<HistoricalImportPreview> {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, {
        type: 'buffer',
        cellFormula: true,
        cellNF: true,
        cellText: true,
      });
    } catch {
      throw new BadRequestException('Не удалось прочитать Excel-файл');
    }
    const metrics = await this.prisma.metric.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, code: true, name: true, unit: true },
    }) as ImportMetricReference[];
    try {
      return annotateNegativeValues(buildHistoricalPreview(workbook, metrics, sanitizeFileName(file.originalname)));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Неизвестный формат исторического файла');
    }
  }

  async confirmImport(data: HistoricalConfirmPayload, userId: number) {
    if (!data || !Number.isInteger(data.coffeeShopId) || data.coffeeShopId <= 0 || !Array.isArray(data.periods)) {
      throw new BadRequestException('Некорректные данные импорта');
    }
    const periods = data.periods.filter((period) => period?.selected === true);
    if (periods.length === 0) throw new BadRequestException('Выберите хотя бы один период для импорта');
    const periodKeys = new Set<string>();
    for (const period of periods) {
      validatePeriod(period);
      const key = `${period.year}-${period.month}`;
      if (periodKeys.has(key)) throw new BadRequestException(`Период ${key} указан дважды`);
      periodKeys.add(key);
    }

    const metrics = await this.prisma.metric.findMany({
      where: { isActive: true },
      select: { id: true, code: true },
    });
    const metricCodes = new Map(metrics.map((metric) => [metric.id, metric.code]));
    for (const period of periods) {
      for (const row of period.rows) {
        if (metricCodes.get(Number(row.metricId)) !== row.code) {
          throw new BadRequestException(`${period.year}-${period.month}: метрика ${row.code} больше не совпадает с конфигурацией`);
        }
      }
    }

    const sourceFile = sanitizeFileName(data.sourceFile);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.monthlyReport.findMany({
        where: {
          coffeeShopId: data.coffeeShopId,
          OR: periods.map((period) => ({ year: period.year!, month: period.month })),
        },
        select: { id: true, year: true, month: true, isLocked: true },
      });
      const locked = existing.filter((report) => report.isLocked);
      if (locked.length > 0) {
        throw new ConflictException(`Заблокированные отчёты нельзя перезаписать: ${locked.map((report) => `${report.year}-${report.month}`).join(', ')}`);
      }
      if (existing.length > 0) {
        throw new ConflictException(`Отчёты уже существуют: ${existing.map((report) => `${report.year}-${report.month}`).join(', ')}`);
      }
      const existingByPeriod = new Map(existing.map((report) => [`${report.year}-${report.month}`, report]));
      const imported: Array<{ year: number; month: number; reportId: number }> = [];
      for (const period of periods) {
        const metricValues = period.rows.map((row) => ({
          metricId: Number(row.metricId),
          absoluteValue: row.absoluteValue == null ? null : new Decimal(row.absoluteValue),
          computedPercent: row.computedPercent == null ? null : new Decimal(row.computedPercent),
          zone: zoneFor(row),
          pointsAwarded: row.sourcePoints == null ? null : new Decimal(row.sourcePoints),
        }));
        const reportData = {
          coffeeShopId: data.coffeeShopId,
          year: period.year!,
          month: period.month,
          revenue: new Decimal(period.revenue!),
          drinksCount: period.drinksCount,
          status: 'SUBMITTED' as const,
          isLocked: true,
          submittedAt: new Date(),
          submittedById: userId,
          formData: buildFormData(period, sourceFile),
          ratingSnapshot: buildRatingSnapshot(period, sourceFile),
        };
        const current = existingByPeriod.get(`${period.year}-${period.month}`);
        const report = current
          ? await tx.monthlyReport.update({
            where: { id: current.id },
            data: {
              ...reportData,
              metricValues: { deleteMany: {}, create: metricValues },
            } as any,
          })
          : await tx.monthlyReport.create({
            data: {
              ...reportData,
              metricValues: { create: metricValues },
            } as any,
          });
        imported.push({ year: period.year!, month: period.month, reportId: report.id });
        await tx.configChangeLog.create({ data: { changedById: userId, fieldChanged: `import:${report.id}`, newValue: JSON.stringify({ sourceFile, year: period.year, month: period.month, policy: 'preserve-source-score' }) } });
      }
      return { imported };
    });
  }
}
