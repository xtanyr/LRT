import * as XLSX from 'xlsx';
import { cleanNumericString, detectMonthYear, MONTH_RU } from './import.parser';

export interface ImportMetricReference {
  id: number;
  code: string;
  name: string;
  unit: string;
}

export interface ImportIssue {
  severity: 'warning' | 'error';
  message: string;
  field?: string;
  code?: string;
  cell?: string;
}

export interface ImportFormField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  sourceCell: string;
}

export interface HistoricalFormData {
  sourceSheet: string;
  fields: ImportFormField[];
}

export interface HistoricalMetricRow {
  metricId?: number;
  code: string;
  metricName: string;
  unit: string;
  absoluteValue: number | null;
  computedPercent: number | null;
  rawValue: string;
  sourceValueCell: string;
  sourcePoints: number | null;
  sourcePointsCell: string;
  sourceFormula?: string;
  sourcePointsStrong: number;
  sourcePointsMedium: number;
  sourceThresholdStrong: number | null;
  sourceThresholdMedium: number | null;
  issue?: string;
}

export interface HistoricalPeriodPreview {
  selected: boolean;
  year?: number;
  month: number;
  revenue: number | null;
  drinksCount: number | null;
  sourceRating: number | null;
  sourceRatingCell: string;
  sourceMaxPoints: number;
  sourceSheet: string;
  rows: HistoricalMetricRow[];
  formData: HistoricalFormData | null;
  issues: ImportIssue[];
}

export interface HistoricalImportPreview {
  coffeeShopId: number;
  sourceFile: string;
  availableMetrics: ImportMetricReference[];
  periods: HistoricalPeriodPreview[];
  warnings: string[];
}

interface LegacyMetricDefinition {
  row: number;
  scoreRow: number;
  codes: string[];
  aliases: string[];
  pointsStrong: number;
  pointsMedium: number;
  revenueShare?: boolean;
  percent?: boolean;
  thresholds: (column: number, drinksCount: number | null) => { strong: number | null; medium: number | null };
}

const fixed = (strong: number, medium: number) => () => ({ strong, medium });

function performanceThresholds(column: number, drinksCount: number | null) {
  if (drinksCount == null) return { strong: null, medium: null };
  if (column <= 4) {
    if (drinksCount >= 13_000) return { strong: 11, medium: 8.5 };
    if (drinksCount >= 10_000) return { strong: 8.5, medium: 7.5 };
    if (drinksCount >= 7_000) return { strong: 7.5, medium: 6.2 };
    return { strong: 6.2, medium: 4 };
  }
  if (drinksCount >= 17_000) return { strong: 9.5, medium: 9 };
  if (drinksCount >= 16_000) return { strong: 9.25, medium: 8.75 };
  if (drinksCount >= 15_000) return { strong: 9, medium: 8.5 };
  if (drinksCount >= 14_000) return { strong: 8.8, medium: 8.3 };
  if (drinksCount >= 13_000) return { strong: 8.5, medium: 8 };
  if (drinksCount >= 12_000) return { strong: 8.2, medium: 7.7 };
  if (drinksCount >= 11_000) return { strong: 7.8, medium: 7.3 };
  if (drinksCount >= 10_000) return { strong: 7.5, medium: 7 };
  if (drinksCount >= 9_000) return { strong: 7.1, medium: 6.6 };
  if (drinksCount >= 8_000) return { strong: 6.6, medium: 6.2 };
  if (drinksCount >= 7_000) return { strong: 6.2, medium: 5.8 };
  return { strong: null, medium: null };
}

export const LEGACY_METRIC_ROWS: LegacyMetricDefinition[] = [
  { row: 2, scoreRow: 345, codes: ['ENPS'], aliases: ['enps', 'инпс'], pointsStrong: 13, pointsMedium: 6.5, percent: true, thresholds: fixed(95, 80) },
  { row: 3, scoreRow: 346, codes: ['REVIEW_SPEED'], aliases: ['средняя скорость разбора отзыва', 'скорость разбора отзыва'], pointsStrong: 13, pointsMedium: 6.5, thresholds: fixed(2, 3) },
  { row: 4, scoreRow: 347, codes: ['GUEST_EXP'], aliases: ['индекс гостевого опыта'], pointsStrong: 13, pointsMedium: 6.5, percent: true, thresholds: fixed(90, 75) },
  { row: 5, scoreRow: 348, codes: ['STANDARDS'], aliases: ['рейтинг стандартов'], pointsStrong: 13, pointsMedium: 6.5, percent: true, thresholds: fixed(90, 75) },
  { row: 6, scoreRow: 349, codes: ['PERFORMANCE'], aliases: ['производительность'], pointsStrong: 9.6, pointsMedium: 4.8, thresholds: performanceThresholds },
  { row: 7, scoreRow: 350, codes: ['LABOR_COST'], aliases: ['доля фот в выручке'], pointsStrong: 9.6, pointsMedium: 4.8, revenueShare: true, percent: true, thresholds: fixed(11, 16) },
  { row: 8, scoreRow: 351, codes: ['DESSERT_WRITEOFF'], aliases: ['доля списания десертов'], pointsStrong: 9.6, pointsMedium: 4.8, revenueShare: true, percent: true, thresholds: fixed(0.8, 1) },
  {
    row: 9,
    scoreRow: 352,
    codes: ['PRODUCT_WRITEOFF'],
    aliases: ['доля списания продуктов', 'доля списания топ-20 продуктов'],
    pointsStrong: 9.6,
    pointsMedium: 4.8,
    revenueShare: true,
    percent: true,
    thresholds: (column) => column <= 4 ? { strong: 0.6, medium: 1 } : { strong: 0.9, medium: 1.1 },
  },
  { row: 10, scoreRow: 353, codes: ['FREE_ACCESS', 'DEPOSIT'], aliases: ['доля депозита в выручке'], pointsStrong: 9.6, pointsMedium: 4.8, revenueShare: true, percent: true, thresholds: fixed(1.3, 1.5) },
];

export const FORM_FIELD_MAPPINGS = [
  ['happinessIndex', 'Индекс счастья', 'C5'],
  ['enps', 'eNPS', 'E5'],
  ['reviewRating', 'Отзывы', 'G5'],
  ['happinessAnalysis', 'Индекс счастья: анализ', 'B6'],
  ['reviewsAnalysis', 'Отзывы: анализ', 'F6'],
  ['guestExperience', 'Индекс гостевого опыта', 'D9'],
  ['standards', 'Рейтинг стандартов', 'G9'],
  ['guestExperienceAnalysis', 'Гостевой опыт: анализ', 'B10'],
  ['standardsAnalysis', 'Стандарты: анализ', 'F10'],
  ['giftReasonsUrl', 'Ссылка на причины подарков', 'H11'],
  ['giftsAmount', 'Подарки: сумма', 'D13'],
  ['giftsRevenueShare', 'Подарки: % от выручки', 'D14'],
  ['giftsAnalysis', 'Подарки: анализ', 'F13'],
  ['revenue', 'Выручка', 'D18'],
  ['laborAmount', 'ФОТ: зарплата', 'D19'],
  ['laborRevenueShare', 'ФОТ: % от выручки', 'D20'],
  ['performance', 'Производительность', 'D21'],
  ['laborAnalysis', 'ФОТ: анализ', 'F18'],
  ['personnelCostsAmount', 'Расходы на персонал: сумма', 'D24'],
  ['personnelCostsRevenueShare', 'Расходы на персонал: % от выручки', 'D25'],
  ['personnelCostsAnalysis', 'Расходы на персонал: анализ', 'F24'],
  ['freeAccessAmount', 'Свободный доступ: сумма', 'D31'],
  ['freeAccessRevenueShare', 'Свободный доступ: % от выручки', 'D32'],
  ['freeAccessAnalysis', 'Свободный доступ: анализ', 'F31'],
  ['dessertWriteoffAmount', 'Списание десертов: сумма', 'D40'],
  ['dessertWriteoffRevenueShare', 'Списание десертов: % от выручки', 'D41'],
  ['dessertWriteoffAnalysis', 'Списание десертов: анализ', 'F40'],
  ['productWriteoffAmount', 'Списание продуктов: сумма', 'D49'],
  ['productWriteoffRevenueShare', 'Списание продуктов: % от выручки', 'D50'],
  ['productWriteoffAnalysis', 'Списание продуктов: анализ', 'F49'],
  ['adminCostsAmount', 'Административные затраты: сумма', 'D58'],
  ['adminCostsRevenueShare', 'Административные затраты: % от выручки', 'D59'],
  ['adminCostsAnalysis', 'Административные затраты: анализ', 'F58'],
  ['rentAmount', 'Аренда: сумма', 'D62'],
  ['rentRevenueShare', 'Аренда: % от выручки', 'D63'],
  ['rentAnalysis', 'Аренда: анализ', 'F62'],
  ['equipmentAmount', 'Оборудование и ремонт: сумма', 'D66'],
  ['equipmentRevenueShare', 'Оборудование и ремонт: % от выручки', 'D67'],
  ['equipmentAnalysis', 'Оборудование и ремонт: анализ', 'F66'],
  ['equipmentPlanUrl', 'Ссылка на план оборудования и ремонта', 'H66'],
  ['summary', 'Итоги месяца', 'B70'],
] as const;

/** Leaders answer some prompts in the neighbouring merged block; used when the primary cell is empty. */
const FORM_FIELD_FALLBACK_CELLS: Record<string, string> = {
  guestExperienceAnalysis: 'D10',
};

/**
 * Sample columns shipped with the blank template («октябрь–декабрь 2025»), in LEGACY_METRIC_ROWS order.
 * They are illustrations of the scoring rules, not results of a coffee shop, and must never be imported.
 */
const TEMPLATE_DEMO_COLUMNS: number[][] = [
  [95, 2, 90, 90, 11, 11, 0.8, 0.5, 1.2],
  [90, 3, 80, 80, 10, 16, 1, 0.7, 1.5],
  [70, 4, 65, 70, 7, 17, 2, 2, 3],
];

function isTemplateDemoColumn(values: Array<number | null>) {
  return TEMPLATE_DEMO_COLUMNS.some((demo) => demo.every((expected, index) => {
    const value = values[index];
    return value != null && Math.abs(value - expected) < 1e-9;
  }));
}

const DEFAULT_DRINKS_ROW = 11;
const DEFAULT_RATING_ROW = 354;

interface MasterLayout {
  valueRows: number[];
  scoreRows: number[];
  drinksRow: number;
  ratingRow: number;
  moved: boolean;
}

function normalize(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
}

function cellRef(sheetName: string, address: string) {
  return `${sheetName}!${address}`;
}

function cellRaw(cell: XLSX.CellObject | undefined) {
  if (!cell || cell.v == null) return '';
  return cell.w != null ? String(cell.w) : String(cell.v);
}

function readNumber(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  address: string,
  percent: boolean,
): { value: number | null; raw: string; issue?: ImportIssue } {
  const cell = sheet[address] as XLSX.CellObject | undefined;
  const raw = cellRaw(cell);
  if (!cell || cell.v == null || raw.trim() === '') return { value: null, raw };
  if (cell.t === 'e' || /^#(?:VALUE|REF|DIV\/0|N\/A|NAME|NUM|NULL)/i.test(raw)) {
    return {
      value: null,
      raw,
      issue: { severity: 'error', message: `Ошибка формулы или ячейки: ${raw}`, cell: cellRef(sheetName, address) },
    };
  }
  if (cell.t === 'n' && typeof cell.v === 'number' && Number.isFinite(cell.v)) {
    const formattedAsPercent = typeof cell.z === 'string' && cell.z.includes('%');
    return { value: percent && formattedAsPercent && Math.abs(cell.v) <= 1 ? cell.v * 100 : cell.v, raw };
  }
  const parsed = cleanNumericString(String(cell.v));
  if (parsed.value == null) {
    return {
      value: null,
      raw,
      issue: parsed.problem
        ? { severity: 'error', message: parsed.problem, cell: cellRef(sheetName, address) }
        : undefined,
    };
  }
  return {
    value: parsed.value,
    raw,
    issue: parsed.problem
      ? { severity: 'warning', message: parsed.problem, cell: cellRef(sheetName, address) }
      : undefined,
  };
}

function monthFromHeader(value: unknown) {
  const text = normalize(String(value ?? ''));
  const match = Object.entries(MONTH_RU).find(([name]) => text.includes(name));
  return match?.[1];
}

function inferMasterPeriods(sheet: XLSX.WorkSheet, sheetName: string) {
  const periods: Array<{ column: number; addressColumn: string; month: number; year?: number; issue?: ImportIssue }> = [];
  let currentYear: number | undefined;
  let previousMonth: number | undefined;
  for (let column = 2; column <= 16; column += 1) {
    const addressColumn = XLSX.utils.encode_col(column - 1);
    const headerCell = sheet[`${addressColumn}1`] as XLSX.CellObject | undefined;
    const header = headerCell?.v;
    const month = monthFromHeader(header);
    if (!month) continue;
    const yearMatch = String(header ?? '').match(/(20\d{2})/);
    if (yearMatch) currentYear = Number(yearMatch[1]);
    else if (previousMonth != null && month < previousMonth && currentYear != null) currentYear += 1;
    const issue = currentYear == null
      ? { severity: 'error' as const, field: 'year', message: 'Не удалось определить год столбца', cell: cellRef(sheetName, `${addressColumn}1`) }
      : undefined;
    periods.push({ column, addressColumn, month, year: currentYear, issue });
    previousMonth = month;
  }
  return periods;
}

/**
 * Finds the master rows by their column-A labels, so a workbook where someone inserted or removed
 * a row still imports. Every row falls back to its position in the original template.
 */
function resolveMasterLayout(sheet: XLSX.WorkSheet): MasterLayout {
  const lastRow = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).e.r + 1 : 0;
  const label = (row: number) => normalize(String((sheet[`A${row}`] as XLSX.CellObject | undefined)?.v ?? ''));
  const findRow = (from: number, to: number, matches: (text: string) => boolean) => {
    for (let row = from; row <= Math.min(to, lastRow); row += 1) {
      const text = label(row);
      if (text && matches(text)) return row;
    }
    return undefined;
  };
  const named = (definition: LegacyMetricDefinition) => (text: string) =>
    definition.aliases.some((alias) => text.includes(normalize(alias)));

  const scoreHeader = findRow(DEFAULT_DRINKS_ROW + 1, lastRow, (text) => text.includes('балльная оценка'));
  const valuesEnd = scoreHeader ? scoreHeader - 1 : 60;
  const valueRows = LEGACY_METRIC_ROWS.map((definition) => findRow(2, valuesEnd, named(definition)) ?? definition.row);
  const scoreRows = LEGACY_METRIC_ROWS.map((definition) =>
    (scoreHeader ? findRow(scoreHeader + 1, lastRow, named(definition)) : undefined) ?? definition.scoreRow);
  const drinksRow = findRow(2, valuesEnd, (text) => text.includes('количество проданных напитков')) ?? DEFAULT_DRINKS_ROW;
  const ratingRow = (scoreHeader ? findRow(scoreHeader + 1, lastRow, (text) => text.includes('итоговый рейтинг')) : undefined)
    ?? DEFAULT_RATING_ROW;
  const moved = drinksRow !== DEFAULT_DRINKS_ROW
    || ratingRow !== DEFAULT_RATING_ROW
    || LEGACY_METRIC_ROWS.some((definition, index) =>
      valueRows[index] !== definition.row || scoreRows[index] !== definition.scoreRow);
  return { valueRows, scoreRows, drinksRow, ratingRow, moved };
}

function detectReportPeriod(sheetName: string) {
  const detected = detectMonthYear(sheetName);
  if (detected.month && !detected.year) {
    const shortYear = normalize(sheetName).match(/(?:^|\s)(\d{2})(?:\s|$)/);
    if (shortYear) detected.year = 2000 + Number(shortYear[1]);
  }
  return detected;
}

/** Section headings of a report sheet (column B) with their row in the original template. */
const REPORT_SECTIONS: Array<{ templateRow: number; matches: (text: string) => boolean }> = [
  { templateRow: 3, matches: (text) => text.startsWith('индекс счастья') },
  { templateRow: 7, matches: (text) => text.startsWith('индекс гостевого опыта') },
  { templateRow: 11, matches: (text) => text === 'подарки' },
  { templateRow: 16, matches: (text) => text === 'фот' },
  { templateRow: 22, matches: (text) => text.startsWith('расходы на персонал') },
  { templateRow: 29, matches: (text) => text.startsWith('свободный доступ') },
  { templateRow: 38, matches: (text) => text.startsWith('списание десертов') },
  { templateRow: 47, matches: (text) => text.startsWith('списание продуктов') },
  { templateRow: 56, matches: (text) => text.startsWith('административные затраты') },
  { templateRow: 60, matches: (text) => text === 'аренда' },
  { templateRow: 64, matches: (text) => text.startsWith('оборудование') },
  { templateRow: 70, matches: (text) => text.startsWith('итоги месяца') },
];

const isAmountLabel = (text: string) => text === 'сумма';
const isShareLabel = (text: string) => text.includes('от выручки');
const isWriteoffLabel = (text: string) => text === 'списание';

/** Rows inside a section that carry their own label in column B, by template row. */
const REPORT_ROW_LABELS: Record<number, (text: string) => boolean> = {
  13: isAmountLabel, 14: isShareLabel,
  18: (text) => text === 'выручка', 19: (text) => text === 'зп', 20: isShareLabel, 21: (text) => text.startsWith('производительность'),
  24: isAmountLabel, 25: isShareLabel,
  31: isAmountLabel, 32: isShareLabel,
  40: isWriteoffLabel, 41: isShareLabel,
  49: isWriteoffLabel, 50: isShareLabel,
  58: isAmountLabel, 59: isShareLabel,
  62: isAmountLabel, 63: isShareLabel,
  66: isAmountLabel, 67: isShareLabel,
};

interface ReportLayout {
  /** Maps a cell address of the original template («D18») to the same cell of this sheet. */
  at: (templateAddress: string) => string;
  shifted: boolean;
}

/**
 * Leaders insert and delete rows in their monthly sheets, so every cell is located through the
 * section heading and row label in column B. A sheet that matches the template maps to itself.
 */
function resolveReportLayout(sheet: XLSX.WorkSheet): ReportLayout {
  const lastRow = Math.min(sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).e.r + 1 : 0, 400);
  const labels: string[] = [];
  for (let row = 1; row <= lastRow; row += 1) {
    labels[row] = normalize(String((sheet[`B${row}`] as XLSX.CellObject | undefined)?.v ?? ''));
  }
  const anchors: Array<{ templateRow: number; row: number; found: boolean }> = [];
  let searchFrom = 1;
  let shift = 0;
  for (const section of REPORT_SECTIONS) {
    let row: number | undefined;
    for (let candidate = searchFrom; candidate <= lastRow; candidate += 1) {
      if (labels[candidate] && section.matches(labels[candidate])) { row = candidate; break; }
    }
    if (row != null) {
      shift = row - section.templateRow;
      searchFrom = row + 1;
    }
    anchors.push({ templateRow: section.templateRow, row: row ?? section.templateRow + shift, found: row != null });
  }
  const cache = new Map<number, number>();
  const rowFor = (templateRow: number) => {
    const cached = cache.get(templateRow);
    if (cached != null) return cached;
    let index = -1;
    anchors.forEach((anchor, position) => { if (anchor.templateRow <= templateRow) index = position; });
    let row = templateRow;
    if (index >= 0) {
      const anchor = anchors[index];
      row = anchor.row + (templateRow - anchor.templateRow);
      const matches = REPORT_ROW_LABELS[templateRow];
      if (matches && anchor.found) {
        const next = anchors.slice(index + 1).find((candidate) => candidate.found);
        const end = Math.min(next ? next.row - 1 : anchor.row + 25, lastRow);
        // Rows sharing a label («сумма» → «% от выручки») keep their template order within the section.
        const from = templateRow > anchor.templateRow + 1 && REPORT_ROW_LABELS[templateRow - 1]
          ? rowFor(templateRow - 1) + 1
          : anchor.row + 1;
        for (let candidate = from; candidate <= end; candidate += 1) {
          if (labels[candidate] && matches(labels[candidate])) { row = candidate; break; }
        }
      }
    }
    cache.set(templateRow, row);
    return row;
  };
  const at = (templateAddress: string) => {
    const match = /^([A-Z]+)(\d+)$/.exec(templateAddress);
    return match ? `${match[1]}${rowFor(Number(match[2]))}` : templateAddress;
  };
  const shifted = FORM_FIELD_MAPPINGS.some(([, , address]) => at(address) !== address);
  return { at, shifted };
}

function formCellValue(sheet: XLSX.WorkSheet, templateSheet: XLSX.WorkSheet | undefined, address: string, templateAddress: string) {
  const value = (sheet[address] as XLSX.CellObject | undefined)?.v;
  if (value == null || typeof value === 'object') return null;
  if (typeof value === 'string') {
    // «%», blank strings and prompts left exactly as in the template sheet are not answers.
    const text = normalize(value);
    const template = (templateSheet?.[templateAddress] as XLSX.CellObject | undefined)?.v;
    if (text === '' || (typeof template === 'string' && normalize(template) === text)) return null;
  }
  return value as string | number | boolean;
}

function extractFormData(sheet: XLSX.WorkSheet, sheetName: string, layout: ReportLayout, templateSheet?: XLSX.WorkSheet): HistoricalFormData {
  return {
    sourceSheet: sheetName,
    fields: FORM_FIELD_MAPPINGS.map(([key, label, primaryAddress]) => {
      let address = layout.at(primaryAddress);
      let value = formCellValue(sheet, templateSheet, address, primaryAddress);
      const fallbackAddress = FORM_FIELD_FALLBACK_CELLS[key];
      if (value == null && fallbackAddress) {
        const fallback = formCellValue(sheet, templateSheet, layout.at(fallbackAddress), fallbackAddress);
        if (fallback != null) {
          address = layout.at(fallbackAddress);
          value = fallback;
        }
      }
      return { key, label, value, sourceCell: cellRef(sheetName, address) };
    }),
  };
}

function metricForDefinition(definition: LegacyMetricDefinition, metrics: ImportMetricReference[]) {
  const byCode = metrics.find((metric) => definition.codes.includes(metric.code.toLocaleUpperCase('ru-RU')));
  if (byCode) return byCode;
  return metrics.find((metric) => {
    const metricName = normalize(metric.name);
    return definition.aliases.some((alias) => metricName.includes(normalize(alias)));
  });
}

export function buildHistoricalPreview(
  workbook: XLSX.WorkBook,
  metrics: ImportMetricReference[],
  sourceFile: string,
): HistoricalImportPreview {
  const sourceSheetName = workbook.SheetNames.find((name) => normalize(name) === 'метрики');
  if (!sourceSheetName) throw new Error('В книге нет листа «Метрики»');
  const sourceSheet = workbook.Sheets[sourceSheetName];
  const reportSheets = new Map<string, { name: string; sheet: XLSX.WorkSheet; layout: ReportLayout }>();
  const duplicateSheets: string[] = [];
  const templateSheetName = workbook.SheetNames.find((name) => normalize(name).includes('шаблон'));
  const templateSheet = templateSheetName ? workbook.Sheets[templateSheetName] : undefined;
  const layout = resolveMasterLayout(sourceSheet);
  for (const name of workbook.SheetNames) {
    if (name === sourceSheetName || normalize(name).includes('шаблон')) continue;
    const detected = detectReportPeriod(name);
    if (!detected.year || !detected.month) continue;
    const key = `${detected.year}-${detected.month}`;
    const existing = reportSheets.get(key);
    // Copies such as «июнь 2026 (Николай)» lose to the plainly named sheet of the same month.
    if (existing) {
      const keepExisting = existing.name.trim().length <= name.trim().length;
      duplicateSheets.push(`«${existing.name.trim()}» и «${name.trim()}» — использован «${(keepExisting ? existing.name : name).trim()}»`);
      if (keepExisting) continue;
    }
    reportSheets.set(key, { name, sheet: workbook.Sheets[name], layout: resolveReportLayout(workbook.Sheets[name]) });
  }

  const warnings = [
    'Источник использует историческую схему 4×13 + 5×9,6 без REVIEW_RATING; рейтинг сохраняется как в файле и не пересчитывается по текущей конфигурации.',
  ];
  const reviewRating = metrics.find((metric) => metric.code === 'REVIEW_RATING');
  if (reviewRating) warnings.push(`Текущая метрика ${reviewRating.code} отсутствует в историческом шаблоне и не получает критическую зону.`);
  if (duplicateSheets.length > 0) warnings.push(`На один месяц найдено несколько листов: ${duplicateSheets.join('; ')}.`);
  const shiftedSheets = [...reportSheets.values()].filter((entry) => entry.layout.shifted).map((entry) => `«${entry.name.trim()}»`);
  if (shiftedSheets.length > 0) {
    warnings.push(`В листах ${shiftedSheets.join(', ')} строки сдвинуты относительно шаблона: ячейки найдены по названиям разделов. Сверьте значения с исходником.`);
  }
  if (layout.moved) {
    warnings.push(`Раскладка листа «${sourceSheetName}» отличается от шаблона: строки найдены по названиям (напитки — строка ${layout.drinksRow}, итоговый рейтинг — строка ${layout.ratingRow}). Сверьте значения с исходником.`);
  }

  const periods = inferMasterPeriods(sourceSheet, sourceSheetName).map((period): HistoricalPeriodPreview => {
    const issues: ImportIssue[] = period.issue ? [period.issue] : [];
    const drinksAddress = `${period.addressColumn}${layout.drinksRow}`;
    const drinks = readNumber(sourceSheet, sourceSheetName, drinksAddress, false);
    if (drinks.issue) issues.push({ ...drinks.issue, field: 'drinksCount' });
    const reportSheet = period.year ? reportSheets.get(`${period.year}-${period.month}`) : undefined;
    const formData = reportSheet ? extractFormData(reportSheet.sheet, reportSheet.name, reportSheet.layout, templateSheet) : null;
    // No sheet for this month: the next month's report repeats it in the «previous month» column C.
    const nextSheet = !reportSheet && period.year
      ? reportSheets.get(period.month === 12 ? `${period.year + 1}-1` : `${period.year}-${period.month + 1}`)
      : undefined;
    const previousColumnSheet = nextSheet
      && monthFromHeader((nextSheet.sheet[nextSheet.layout.at('C17')] as XLSX.CellObject | undefined)?.v) === period.month
      ? nextSheet
      : undefined;
    const amountSheet = reportSheet ?? previousColumnSheet;
    const amountColumn = reportSheet ? 'D' : 'C';
    const revenueAddress = amountSheet ? amountSheet.layout.at(`${amountColumn}18`) : `${amountColumn}18`;
    const revenue = amountSheet
      ? readNumber(amountSheet.sheet, amountSheet.name, revenueAddress, false)
      : { value: null, raw: '' };
    if (revenue.issue) issues.push({ ...revenue.issue, field: 'revenue' });
    if (revenue.value == null && !revenue.issue) {
      // A missing revenue does not block the period: the source rating and points do not depend on it.
      issues.push({
        severity: 'warning',
        field: 'revenue',
        message: 'В файле нет выручки за период: отчёт можно импортировать без неё (сохранится 0 ₽) или вписать выручку вручную.',
        cell: amountSheet ? cellRef(amountSheet.name, revenueAddress) : undefined,
      });
    } else if (revenue.value != null && previousColumnSheet) {
      issues.push({
        severity: 'warning',
        field: 'revenue',
        message: `Листа отчёта за этот месяц нет: выручка и суммы взяты из столбца предыдущего месяца листа «${previousColumnSheet.name}». Тексты анализа не импортируются.`,
        cell: cellRef(previousColumnSheet.name, revenueAddress),
      });
    }

    const sourceValues: Array<number | null> = [];
    const rows = LEGACY_METRIC_ROWS.map((definition, definitionIndex): HistoricalMetricRow => {
      const sourceAddress = `${period.addressColumn}${layout.valueRows[definitionIndex]}`;
      const sourcePointsAddress = `${period.addressColumn}${layout.scoreRows[definitionIndex]}`;
      const parsedValue = readNumber(sourceSheet, sourceSheetName, sourceAddress, Boolean(definition.percent));
      const parsedPoints = readNumber(sourceSheet, sourceSheetName, sourcePointsAddress, false);
      const metric = metricForDefinition(definition, metrics);
      sourceValues.push(parsedValue.value);
      if (parsedValue.issue) issues.push({ ...parsedValue.issue, field: 'metricValue', code: definition.codes[0] });
      if (parsedPoints.issue) issues.push({ ...parsedPoints.issue, field: 'sourcePoints', code: definition.codes[0] });
      if (!metric) {
        issues.push({
          severity: 'error',
          field: 'metricId',
          code: definition.codes[0],
          message: `Метрика ${definition.codes.join('/')} не найдена в конфигурации; выберите соответствие вручную.`,
          cell: cellRef(sourceSheetName, `A${layout.valueRows[definitionIndex]}`),
        });
      }
      const sourceCell = sourceSheet[sourcePointsAddress] as XLSX.CellObject | undefined;
      const thresholds = definition.thresholds(period.column, drinks.value);
      let absoluteValue = definition.revenueShare ? null : parsedValue.value;
      const computedPercent = definition.revenueShare ? parsedValue.value : null;
      if (amountSheet) {
        const amountRow = definition.codes[0] === 'LABOR_COST'
          ? 19
          : definition.codes[0] === 'DESSERT_WRITEOFF'
            ? 40
            : definition.codes[0] === 'PRODUCT_WRITEOFF'
              ? 49
              : undefined;
        if (amountRow) {
          const amount = readNumber(amountSheet.sheet, amountSheet.name, amountSheet.layout.at(`${amountColumn}${amountRow}`), false);
          // The rouble amount only complements the share taken from «Метрики»: unreadable text is skipped, not fatal.
          if (amount.issue) {
            issues.push({
              ...amount.issue,
              severity: 'warning',
              field: 'absoluteValue',
              code: definition.codes[0],
              message: `${amount.issue.message} — сумма в рублях не импортируется, доля из листа «${sourceSheetName}» сохранена.`,
            });
          }
          if (amount.value != null) absoluteValue = amount.value;
        }
      }
      return {
        metricId: metric?.id,
        code: metric?.code ?? definition.codes[0],
        metricName: metric?.name ?? String((sourceSheet[`A${layout.valueRows[definitionIndex]}`] as XLSX.CellObject | undefined)?.v ?? definition.aliases[0]),
        unit: metric?.unit ?? (definition.percent ? '%' : ''),
        absoluteValue,
        computedPercent,
        rawValue: parsedValue.raw,
        sourceValueCell: cellRef(sourceSheetName, sourceAddress),
        sourcePoints: parsedPoints.value,
        sourcePointsCell: cellRef(sourceSheetName, sourcePointsAddress),
        sourceFormula: sourceCell?.f,
        sourcePointsStrong: definition.pointsStrong,
        sourcePointsMedium: definition.pointsMedium,
        sourceThresholdStrong: thresholds.strong,
        sourceThresholdMedium: thresholds.medium,
        issue: parsedValue.issue?.message ?? parsedPoints.issue?.message,
      };
    });

    const ratingAddress = `${period.addressColumn}${layout.ratingRow}`;
    const rating = readNumber(sourceSheet, sourceSheetName, ratingAddress, false);
    if (rating.issue) issues.push({ ...rating.issue, field: 'sourceRating' });
    const hasMetricData = rows.some((row) => row.absoluteValue != null || row.computedPercent != null);
    if (hasMetricData && rating.value == null && !rating.issue) {
      issues.push({
        severity: 'error',
        field: 'sourceRating',
        message: 'В исходной книге нет рассчитанного итогового рейтинга за период.',
        cell: cellRef(sourceSheetName, ratingAddress),
      });
    }
    if (isTemplateDemoColumn(sourceValues)) {
      issues.push({
        severity: 'error',
        field: 'templateDemo',
        message: 'Столбец совпадает с демонстрационным примером из шаблона — это не данные кофейни, период не импортируется.',
        cell: cellRef(sourceSheetName, `${period.addressColumn}1`),
      });
    } else if (hasMetricData) {
      const missing = rows.filter((_, index) => sourceValues[index] == null).map((row) => row.metricName);
      if (missing.length > 0) {
        issues.push({
          severity: 'warning',
          field: 'metricValue',
          message: `Период заполнен не полностью — нет значений: ${missing.join(', ')}. Если месяц ещё не закрыт, импортируйте его позже: повторно загрузить период нельзя.`,
        });
      }
    }
    const selected = hasMetricData && !issues.some((issue) => issue.severity === 'error');
    return {
      selected,
      year: period.year,
      month: period.month,
      revenue: revenue.value,
      drinksCount: drinks.value == null ? null : Math.round(drinks.value),
      sourceRating: rating.value,
      sourceRatingCell: cellRef(sourceSheetName, ratingAddress),
      sourceMaxPoints: 100,
      sourceSheet: sourceSheetName,
      rows,
      formData,
      issues,
    };
  });

  return { coffeeShopId: 0, sourceFile, availableMetrics: metrics, periods, warnings };
}
