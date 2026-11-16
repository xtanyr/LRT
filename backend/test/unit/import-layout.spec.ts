import * as XLSX from 'xlsx';
import { buildHistoricalPreview } from '../../src/imports/import-layout';
import { decodeUploadFileName } from '../../src/imports/import.parser';

const metrics = [
  { id: 1, code: 'ENPS', name: 'eNPS', unit: '%' },
  { id: 2, code: 'REVIEW_SPEED', name: 'Скорость разбора отзыва', unit: 'суток' },
  { id: 3, code: 'GUEST_EXP', name: 'Индекс гостевого опыта', unit: '%' },
  { id: 4, code: 'STANDARDS', name: 'Рейтинг стандартов', unit: '%' },
  { id: 5, code: 'PERFORMANCE', name: 'Производительность', unit: 'ед.' },
  { id: 6, code: 'LABOR_COST', name: 'Доля ФОТ в выручке', unit: '%' },
  { id: 7, code: 'DESSERT_WRITEOFF', name: 'Доля списания десертов', unit: '%' },
  { id: 8, code: 'PRODUCT_WRITEOFF', name: 'Доля списания продуктов', unit: '%' },
  { id: 9, code: 'FREE_ACCESS', name: 'Доля депозита в выручке', unit: '%' },
  { id: 10, code: 'REVIEW_RATING', name: 'Рейтинг отзывов за месяц', unit: 'балл' },
];

function fixture(options: { ratingError?: boolean } = {}) {
  const workbook = XLSX.utils.book_new();
  const rows: unknown[][] = [];
  rows[0] = ['КОФЕЙНЯ', 'декабрь 2025', 'январь'];
  rows[1] = ['eNPS, %', 95, 0.95];
  rows[2] = ['Средняя скорость разбора отзыва, суток', 2, 3];
  rows[3] = ['Индекс гостевого опыта, %', 90, 80];
  rows[4] = ['Рейтинг стандартов, %', 90, 80];
  rows[5] = ['Производительность, единиц.', 11, 8.5];
  rows[6] = ['Доля ФОТ в выручке, %', 11, 12];
  rows[7] = ['Доля списания десертов в выручке, %', 0.8, 0.9];
  rows[8] = ['Доля списания продуктов в выручке, %', 0.6, 1];
  rows[9] = ['Доля депозита в выручке, %', 1.3, 1.4];
  rows[10] = ['Количество проданных напитков за месяц (не метрика, собираем для расчетов)', 13000, 12000];
  rows[343] = ['БАЛЛЬНАЯ ОЦЕНКА'];
  for (let index = 0; index < 9; index += 1) rows[344 + index] = [rows[index + 1][0]];
  rows[353] = ['Итоговый рейтинг'];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet.C2.z = '0%';
  const decemberPoints = [13, 13, 13, 13, 9.6, 9.6, 9.6, 9.6, 9.6];
  const januaryPoints = [13, 6.5, 6.5, 6.5, 4.8, 4.8, 4.8, 4.8, 4.8];
  decemberPoints.forEach((value, index) => {
    sheet[`B${345 + index}`] = { t: 'n', f: '=LEGACY()', v: value };
    sheet[`C${345 + index}`] = { t: 'n', f: '=LEGACY()', v: value === 13 ? januaryPoints[index] : januaryPoints[index] };
  });
  sheet.B354 = { t: 'n', f: '=SUM(B345:B353)', v: 100 };
  sheet.C354 = options.ratingError
    ? { t: 'e', f: '=SUM(C345:C353)', v: 15, w: '#VALUE!' }
    : { t: 'n', f: '=SUM(C345:C353)', v: 49.3 };
  XLSX.utils.book_append_sheet(workbook, sheet, 'Метрики');

  const reportRows: unknown[][] = [];
  reportRows[0] = [];
  reportRows[1] = ['', 'КОМАНДА И ГОСТИ'];
  reportRows[17] = ['', 'выручка', '', 500000];
  reportRows[18] = ['', 'зп', '', 55000];
  reportRows[19] = ['', '% от выручки', '', 0.11];
  reportRows[20] = ['', 'производительность', '', 8.5];
  reportRows[69] = ['', 'Итоги месяца', 'Синтетический итог'];
  const reportSheet = XLSX.utils.aoa_to_sheet(reportRows);
  reportSheet.D20.z = '0%';
  XLSX.utils.book_append_sheet(workbook, reportSheet, 'январь 26');
  return workbook;
}

describe('buildHistoricalPreview', () => {
  it('maps the real master row/month layout, metric codes, form revenue and cell provenance', () => {
    const preview = buildHistoricalPreview(fixture(), metrics, 'synthetic-history.xlsx');

    expect(preview.periods).toHaveLength(2);
    expect(preview.periods[0]).toMatchObject({ year: 2025, month: 12, sourceRating: 100 });
    expect(preview.periods[1]).toMatchObject({ year: 2026, month: 1, revenue: 500000, sourceRating: 49.3 });
    expect(preview.periods[1].rows.find((row) => row.code === 'ENPS')).toMatchObject({
      metricId: 1,
      absoluteValue: 95,
      sourceValueCell: 'Метрики!C2',
      sourcePointsCell: 'Метрики!C345',
    });
    expect(preview.periods[1].rows.find((row) => row.code === 'LABOR_COST')).toMatchObject({
      metricId: 6,
      absoluteValue: 55000,
      computedPercent: 12,
      sourceValueCell: 'Метрики!C7',
    });
    expect(preview.periods[1].formData).toMatchObject({ sourceSheet: 'январь 26' });
    expect(preview.warnings.join(' ')).toContain('REVIEW_RATING');
  });

  it('surfaces cached formula errors and prevents selecting the affected period', () => {
    const preview = buildHistoricalPreview(fixture({ ratingError: true }), metrics, 'synthetic-history.xlsx');
    const january = preview.periods[1];

    expect(january.selected).toBe(false);
    expect(january.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', field: 'sourceRating', cell: 'Метрики!C354' }),
    ]));
  });
});

describe('buildHistoricalPreview on real-world workbook quirks', () => {
  const text = (value: string): XLSX.CellObject => ({ t: 's', v: value });
  const number = (value: number): XLSX.CellObject => ({ t: 'n', v: value });
  const field = (preview: ReturnType<typeof buildHistoricalPreview>, period: number, key: string) =>
    preview.periods[period].formData?.fields.find((item) => item.key === key);

  it('refuses the demonstration columns that ship with the blank template', () => {
    const workbook = fixture();
    const master = workbook.Sheets['Метрики'];
    master.B9 = number(0.5);
    master.B10 = number(1.2);

    const december = buildHistoricalPreview(workbook, metrics, 'synthetic-history.xlsx').periods[0];

    expect(december.selected).toBe(false);
    expect(december.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', field: 'templateDemo', cell: 'Метрики!B1' }),
    ]));
  });

  it('takes revenue and amounts from the next report sheet when the month has no sheet of its own', () => {
    const workbook = fixture();
    const report = workbook.Sheets['январь 26'];
    report.C17 = text('декабрь');
    report.C18 = text('400 000,00 ₽');
    report.C19 = number(44000);

    const december = buildHistoricalPreview(workbook, metrics, 'synthetic-history.xlsx').periods[0];

    expect(december).toMatchObject({ revenue: 400000, formData: null, selected: true });
    expect(december.rows.find((row) => row.code === 'LABOR_COST')).toMatchObject({ absoluteValue: 44000, computedPercent: 11 });
    expect(december.issues).toEqual([
      expect.objectContaining({ severity: 'warning', field: 'revenue', cell: 'январь 26!C18' }),
    ]);
  });

  it('does not borrow the previous-month column when its header names another month', () => {
    const workbook = fixture();
    const report = workbook.Sheets['январь 26'];
    report.C17 = text('ноябрь');
    report.C18 = number(400000);

    const december = buildHistoricalPreview(workbook, metrics, 'synthetic-history.xlsx').periods[0];

    expect(december.revenue).toBeNull();
  });

  it('keeps a period without revenue importable and only warns about it', () => {
    const december = buildHistoricalPreview(fixture(), metrics, 'synthetic-history.xlsx').periods[0];

    expect(december).toMatchObject({ revenue: null, selected: true });
    expect(december.issues).toEqual([
      expect.objectContaining({ severity: 'warning', field: 'revenue' }),
    ]);
  });

  it('still blocks a period whose revenue cell holds an unreadable value', () => {
    const workbook = fixture();
    workbook.Sheets['январь 26'].D18 = text('403000 ???');

    const january = buildHistoricalPreview(workbook, metrics, 'synthetic-history.xlsx').periods[1];

    expect(january.selected).toBe(false);
    expect(january.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', field: 'revenue', cell: 'январь 26!D18' }),
    ]));
  });

  it('finds master rows by their labels when a row was inserted above the score block', () => {
    const workbook = fixture();
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['Метрики'], { header: 1, blankrows: true });
    rows.splice(11, 0, []);
    workbook.Sheets['Метрики'] = XLSX.utils.aoa_to_sheet(rows);

    const preview = buildHistoricalPreview(workbook, metrics, 'synthetic-history.xlsx');
    const january = preview.periods[1];

    expect(january).toMatchObject({ sourceRating: 49.3, sourceRatingCell: 'Метрики!C355', drinksCount: 12000 });
    expect(january.rows.find((row) => row.code === 'ENPS')).toMatchObject({ sourcePoints: 13, sourcePointsCell: 'Метрики!C346' });
    expect(preview.warnings.join(' ')).toContain('Раскладка листа');
  });

  it('warns about a partly filled month without blocking it', () => {
    const workbook = fixture();
    delete workbook.Sheets['Метрики'].C7;

    const january = buildHistoricalPreview(workbook, metrics, 'synthetic-history.xlsx').periods[1];

    expect(january.selected).toBe(true);
    expect(january.issues).toEqual([
      expect.objectContaining({ severity: 'warning', field: 'metricValue', message: expect.stringContaining('Доля ФОТ в выручке') }),
    ]);
  });

  it('drops untouched template prompts and reads answers from the cells leaders actually use', () => {
    const workbook = fixture();
    const prompt = '1. Проблемы\n2. Причины\n3. План по устранению (конкретные действия)';
    const template = XLSX.utils.aoa_to_sheet([[]]);
    template.B6 = text(prompt);
    template.F6 = text('1. Перечень корневых причин');
    XLSX.utils.book_append_sheet(workbook, template, 'шаблон отчета');
    const report = workbook.Sheets['январь 26'];
    report.B6 = text(`${prompt} `);
    report.F6 = text('1. Перечень корневых причин: холодный кофе');
    report.D9 = text('%');
    report.D10 = text('Пыль на поверхностях');
    report.F23 = text('анализ');
    report.F24 = text('Сменили обувь по новому стандарту');

    const preview = buildHistoricalPreview(workbook, metrics, 'synthetic-history.xlsx');

    expect(field(preview, 1, 'happinessAnalysis')?.value).toBeNull();
    expect(field(preview, 1, 'guestExperience')?.value).toBeNull();
    expect(field(preview, 1, 'reviewsAnalysis')?.value).toBe('1. Перечень корневых причин: холодный кофе');
    expect(field(preview, 1, 'guestExperienceAnalysis')).toMatchObject({ value: 'Пыль на поверхностях', sourceCell: 'январь 26!D10' });
    expect(field(preview, 1, 'personnelCostsAnalysis')).toMatchObject({ value: 'Сменили обувь по новому стандарту', sourceCell: 'январь 26!F24' });
  });
});

describe('decodeUploadFileName', () => {
  it('restores Cyrillic names that the multipart parser decoded as latin1', () => {
    const mangled = Buffer.from('Лена Ашурова.xlsx', 'utf8').toString('latin1');

    expect(decodeUploadFileName(mangled)).toBe('Лена Ашурова.xlsx');
  });

  it('leaves correct and plain latin names untouched', () => {
    expect(decodeUploadFileName('Лена Ашурова.xlsx')).toBe('Лена Ашурова.xlsx');
    expect(decodeUploadFileName('history-2026.xlsx')).toBe('history-2026.xlsx');
    expect(decodeUploadFileName('café.xlsx')).toBe('café.xlsx');
  });
});
