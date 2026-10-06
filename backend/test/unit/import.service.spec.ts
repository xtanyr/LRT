import { BadRequestException, ConflictException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ImportService } from '../../src/imports/import.service';
import { LEGACY_METRIC_ROWS } from '../../src/imports/import-layout';

const activeMetrics = [
  { id: 1, code: 'ENPS', name: 'eNPS', unit: '%' },
  { id: 6, code: 'LABOR_COST', name: 'Доля ФОТ в выручке', unit: '%' },
];

const validPayload = {
  coffeeShopId: 7,
  sourceFile: 'synthetic-history.xlsx',
  overwriteExisting: false,
  periods: [{
    selected: true,
    year: 2025,
    month: 12,
    revenue: 500000,
    drinksCount: 13000,
    sourceRating: 21.5,
    sourceRatingCell: 'Метрики!B354',
    sourceMaxPoints: 21.5,
    sourceSheet: 'Метрики',
    issues: [],
    formData: { sourceSheet: 'декабрь 25', fields: [] },
    rows: [
      {
        metricId: 1,
        rawValue: '95',
        code: 'ENPS',
        metricName: 'eNPS',
        unit: '%',
        absoluteValue: 95,
        computedPercent: null,
        sourceValueCell: 'Метрики!B2',
        sourcePoints: 13,
        sourcePointsCell: 'Метрики!B345',
        sourceFormula: '=LEGACY_ENPS()',
        sourcePointsStrong: 13,
        sourcePointsMedium: 6.5,
        sourceThresholdStrong: 95,
        sourceThresholdMedium: 80,
      },
      {
        metricId: 6,
        rawValue: '11%',
        code: 'LABOR_COST',
        metricName: 'Доля ФОТ в выручке',
        unit: '%',
        absoluteValue: 55000,
        computedPercent: 11,
        sourceValueCell: 'Метрики!B7',
        sourcePoints: 8.5,
        sourcePointsCell: 'Метрики!B350',
        sourceFormula: '=LEGACY_LABOR()',
        sourcePointsStrong: 8.5,
        sourcePointsMedium: 4.25,
        sourceThresholdStrong: 11,
        sourceThresholdMedium: 16,
      },
    ],
  }],
};

function fakePrisma(existing: Array<{ id: number; year: number; month: number; isLocked: boolean }> = []) {
  const created: any[] = [];
  const updated: any[] = [];
  const tx = {
    configChangeLog: { create: jest.fn().mockResolvedValue({}) },
    monthlyReport: {
      findMany: async () => existing,
      create: async (args: any) => {
        created.push(args.data);
        return { id: 100 + created.length, ...args.data };
      },
      update: async (args: any) => {
        updated.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
  };
  return {
    created,
    updated,
    metric: { findMany: async () => activeMetrics },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
}

describe('ImportService.confirmImport', () => {
  it('creates locked reports atomically with source rating/config/provenance intact', async () => {
    const prisma = fakePrisma();
    const service = new ImportService(prisma as any);

    const result = await service.confirmImport(validPayload, 42);

    expect(result).toEqual({ imported: [{ year: 2025, month: 12, reportId: 101 }] });
    expect(prisma.created).toHaveLength(1);
    expect(prisma.created[0]).toMatchObject({
      coffeeShopId: 7,
      year: 2025,
      month: 12,
      status: 'SUBMITTED',
      isLocked: true,
      submittedById: 42,
      ratingSnapshot: {
        rating: 21.5,
        totalPoints: 21.5,
        maxPoints: 21.5,
        source: {
          kind: 'legacy-xlsx',
          fileName: 'synthetic-history.xlsx',
          ratingCell: 'Метрики!B354',
        },
      },
    });
    expect(prisma.created[0].metricValues.create[1]).toMatchObject({
      metricId: 6,
      absoluteValue: expect.anything(),
      computedPercent: expect.anything(),
    });
  });

  it('refuses existing reports by default and always refuses locked reports', async () => {
    const unlocked = new ImportService(fakePrisma([{ id: 1, year: 2025, month: 12, isLocked: false }]) as any);
    await expect(unlocked.confirmImport(validPayload, 42)).rejects.toBeInstanceOf(ConflictException);

    const lockedPayload = { ...validPayload, overwriteExisting: true };
    const locked = new ImportService(fakePrisma([{ id: 1, year: 2025, month: 12, isLocked: true }]) as any);
    await expect(locked.confirmImport(lockedPayload, 42)).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates every selected row before opening the transaction', async () => {
    const prisma = fakePrisma();
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.periods[0].rows[1].metricId = undefined;
    const service = new ImportService(prisma as any);

    await expect(service.confirmImport(payload, 42)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.created).toHaveLength(0);
  });

  it.each(['absoluteValue', 'computedPercent', 'sourcePoints'])('rejects negative row %s before writing any report', async (field) => {
    const prisma = fakePrisma();
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.periods[0].rows[1][field] = -0.01;
    const service = new ImportService(prisma as any);

    await expect(service.confirmImport(payload, 42)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.created).toHaveLength(0);
    expect(prisma.updated).toHaveLength(0);
  });

  it.each([-1, '-1,25', '-1 000 ₽'])('rejects a negative numeric form value %s before writing any report', async (value) => {
    const prisma = fakePrisma();
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.periods[0].formData.fields = [{ key: 'laborAmount', label: 'ФОТ', value, sourceCell: 'декабрь 25!D19' }];
    const service = new ImportService(prisma as any);

    await expect(service.confirmImport(payload, 42)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.created).toHaveLength(0);
  });

  it.each([
    ['giftsPlan', -1],
    ['metricPlan_1', -1],
    ['revenuePlan', -1],
    ['gifts', '-1,25'],
  ])('rejects a negative additional numeric form field %s before writing any report', async (key, value) => {
    const prisma = fakePrisma();
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.periods[0].formData.fields = [{ key, label: key, value, sourceCell: 'декабрь 25!D13' }];
    const service = new ImportService(prisma as any);

    await expect(service.confirmImport(payload, 42)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.created).toHaveLength(0);
  });

  it('accepts zero metric values and preserves narrative form text', async () => {
    const prisma = fakePrisma();
    const payload = JSON.parse(JSON.stringify(validPayload));
    Object.assign(payload.periods[0].rows[1], { absoluteValue: 0, computedPercent: 0, sourcePoints: 0, sourceThresholdStrong: -1 });
    payload.periods[0].formData.fields = [{ key: 'laborAnalysis', label: 'ФОТ: анализ', value: '-1', sourceCell: 'декабрь 25!F18' }];
    const service = new ImportService(prisma as any);

    await expect(service.confirmImport(payload, 42)).resolves.toMatchObject({ imported: [{ reportId: 101 }] });
    expect(prisma.created[0].metricValues.create[1].absoluteValue.toNumber()).toBe(0);
    expect(prisma.created[0].formData.fields[0].value).toBe('-1');
    expect(prisma.created[0].ratingSnapshot.results[1].thresholdStrong).toBe(-1);
  });

  it('preserves the corrected current revenue when the imported source revenue was negative', async () => {
    const prisma = fakePrisma();
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.periods[0].formData.fields = [{ key: 'revenue', label: 'Выручка', value: -1, sourceCell: 'декабрь 25!D18' }];
    payload.periods[0].issues = [{ severity: 'error', field: 'revenue', message: 'Выручка должна быть не меньше нуля', cell: 'декабрь 25!D18' }];
    const service = new ImportService(prisma as any);

    await expect(service.confirmImport(payload, 42)).resolves.toMatchObject({ imported: [{ reportId: 101 }] });
    expect(prisma.created[0].revenue.toNumber()).toBe(500000);
    expect(prisma.created[0].formData.fields[0]).toMatchObject({ key: 'revenue', value: 500000, sourceCell: 'декабрь 25!D18' });
  });

  it('rejects a currently negative revenue even if the imported source revenue was valid', async () => {
    const prisma = fakePrisma();
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.periods[0].revenue = -1;
    payload.periods[0].formData.fields = [{ key: 'revenue', label: 'Выручка', value: 500000, sourceCell: 'декабрь 25!D18' }];
    const service = new ImportService(prisma as any);

    await expect(service.confirmImport(payload, 42)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.created).toHaveLength(0);
  });
});

function previewFile(sheetName: string, address: string, value: string | number) {
  const workbook = XLSX.utils.book_new();
  const rows: unknown[][] = [];
  rows[0] = ['КОФЕЙНЯ', 'декабрь 2025'];
  for (const definition of LEGACY_METRIC_ROWS) {
    rows[definition.row - 1] = [definition.aliases[0], 1];
    rows[definition.scoreRow - 1] = [definition.aliases[0], definition.pointsStrong];
  }
  rows[10] = ['Количество напитков', 13000];
  rows[353] = ['Итоговый рейтинг', 100];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Метрики');
  const form = XLSX.utils.aoa_to_sheet([]);
  form.D18 = { t: 'n', v: 500000 };
  form.D19 = { t: 'n', v: 55000 };
  form['!ref'] = 'A1:H70';
  XLSX.utils.book_append_sheet(workbook, form, 'декабрь 25');
  workbook.Sheets[sheetName][address] = { t: typeof value === 'number' ? 'n' : 's', v: value };
  return { originalname: 'negative-history.xlsx', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) };
}

describe('ImportService.previewImport', () => {
  it('returns a revenue issue that the existing revenue correction workflow can clear', async () => {
    const metrics = LEGACY_METRIC_ROWS.map((definition, index) => ({ id: index + 1, code: definition.codes[0], name: definition.aliases[0], unit: '%' }));
    const service = new ImportService({ metric: { findMany: async () => metrics } } as any);

    const preview = await service.previewImport(previewFile('декабрь 25', 'D18', -1), 42);

    expect(preview.periods[0].selected).toBe(false);
    expect(preview.periods[0].issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', field: 'revenue', cell: 'декабрь 25!D18' }),
    ]));
    expect(preview.periods[0].issues.some((issue) => issue.severity === 'error' && issue.field !== 'revenue')).toBe(false);
  });

  it.each([
    ['Метрики', 'B2', -1, 'absoluteValue', 'ENPS'],
    ['Метрики', 'B7', -1, 'computedPercent', 'LABOR_COST'],
    ['Метрики', 'B350', -1, 'sourcePoints', 'LABOR_COST'],
    ['декабрь 25', 'D19', -1, 'formData:laborAmount', undefined],
    ['декабрь 25', 'D19', '-1,25', 'formData:laborAmount', undefined],
  ] as const)('returns a corrective issue for negative %s!%s instead of failing preview', async (sheetName, address, value, field, code) => {
    const metrics = LEGACY_METRIC_ROWS.map((definition, index) => ({ id: index + 1, code: definition.codes[0], name: definition.aliases[0], unit: '%' }));
    const service = new ImportService({ metric: { findMany: async () => metrics } } as any);

    const preview = await service.previewImport(previewFile(sheetName, address, value), 42);

    expect(preview.periods[0].selected).toBe(false);
    expect(preview.periods[0].issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', field, cell: `${sheetName}!${address}`, ...(code ? { code } : {}) }),
    ]));
    if (code) expect(preview.periods[0].rows.find((row) => row.code === code)?.issue).toBeTruthy();
  });
});
