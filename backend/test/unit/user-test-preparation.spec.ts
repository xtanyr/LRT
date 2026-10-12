import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const {
  PREPARATION_KEY, TARGET_HOSTNAME, DELETE_MODELS, validateInput,
  parseArguments, readOptions, prepareUserTest, assertDemoSeedAllowed,
} = require('../../prisma/prepare-user-test.cjs');
const reference = require('../../prisma/reference-config.cjs');
const directory = require('../../prisma/coffee-shop-directory.json');

const passwordHash = '$2b$10$' + 'A'.repeat(53);
const admin = {
  id: 8, name: 'Администратор', email: 'admin@example.com', role: 'ADMIN',
  passwordHash, googleOauthId: 'preserve-oauth', approvedAt: '2026-01-01',
  reportExampleHelpDismissed: true,
};
const sample = { cities: [{ name: 'Омск', coffeeShops: [{ name: 'Лермонтова' }] }] };
const applyOptions = {
  apply: true, input: sample, adminEmail: admin.email,
  confirmation: TARGET_HOSTNAME, targetHostname: TARGET_HOSTNAME,
};

function database(overrides: Record<string, any[]> = {}, failAt?: string) {
  let state: Record<string, any[]> = Object.fromEntries(DELETE_MODELS.map((model: string) => [model, [{ id: 1 }]]));
  Object.assign(state, {
    user: [structuredClone(admin), { id: 9, role: 'LEADER', email: 'leader@example.com' }],
    metric: [{ id: 31, ...reference.metrics[0], name: 'Custom eNPS', thresholdStrong: 93, isActive: false }],
    analysisQuestion: [{ id: 32, ...reference.analysisQuestions[0], label: 'Custom question', isActive: false }],
    triggerConfig: [{ id: 33, code: 'T1', thresholdRating: 57, monthsCount: 7, isActive: false }],
    ratingColorConfig: [{ id: 40, greenThreshold: 85, redThreshold: 55, updatedById: 9 }],
    coffeeShopCategory: [{ id: 50, name: 'Существующая категория' }],
    metricThresholdOverride: [{ id: 51, metricId: 31, categoryId: 50, thresholdStrong: 92 }],
    systemSetting: [{ key: 'integration.private', value: 'preserved-integration-settings' }],
  }, structuredClone(overrides));
  const operations: string[] = [];
  const matches = (record: any, where: any): boolean => Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (value && typeof value === 'object') {
      if ('not' in value) return record[key] !== value.not;
      if ('equals' in value) return value.mode === 'insensitive'
        ? String(record[key]).toLowerCase() === value.equals.toLowerCase()
        : record[key] === value.equals;
    }
    return record[key] === value;
  });
  const prisma = {
    $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) => {
      const draft = structuredClone(state);
      const tx: any = {
        $executeRawUnsafe: jest.fn(async (query: string) => { operations.push(query); }),
        $queryRawUnsafe: jest.fn(async (query: string) => { operations.push(query); return [{ locked: 1 }]; }),
      };
      for (const model of Object.keys(draft)) {
        tx[model] = {
          count: jest.fn(async (args: any = {}) => draft[model].filter(row => matches(row, args.where)).length),
          findMany: jest.fn(async (args: any = {}) => draft[model].filter(row => matches(row, args.where)).slice(0, args.take ?? Infinity)
            .map(row => args.select ? Object.fromEntries(Object.keys(args.select).map(key => [key, row[key]])) : row)),
          findUnique: jest.fn(async ({ where }: any) => draft[model].find(row => matches(row, where)) ?? null),
          findFirst: jest.fn(async () => draft[model][0] ?? null),
          deleteMany: jest.fn(async (args: any = {}) => {
            operations.push(`${model}.deleteMany`);
            const before = draft[model].length;
            draft[model] = draft[model].filter(row => !matches(row, args.where));
            return { count: before - draft[model].length };
          }),
          create: jest.fn(async ({ data }: any) => {
            operations.push(`${model}.create`);
            if (failAt === `${model}.create`) throw new Error('Simulated database write failure');
            if (model === 'systemSetting' && draft[model].some(row => row.key === data.key)) throw new Error('Duplicate marker');
            const created = { id: Math.max(0, ...draft[model].map(row => row.id ?? 0)) + 1, ...structuredClone(data) };
            draft[model].push(created);
            return created;
          }),
          upsert: jest.fn(async ({ where, update, create }: any) => {
            operations.push(`${model}.upsert`);
            const existing = draft[model].find(row => matches(row, where));
            if (existing) { Object.assign(existing, structuredClone(update)); return existing; }
            const created = { id: Math.max(0, ...draft[model].map(row => row.id ?? 0)) + 1, ...structuredClone(create) };
            draft[model].push(created);
            return created;
          }),
        };
      }
      const result = await callback(tx);
      state = draft;
      return result;
    }),
  };
  return { prisma, operations, snapshot: () => structuredClone(state) };
}

describe('one-time user-test preparation', () => {
  it('uses model delegate names from the generated Prisma client without connecting to a database', () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    for (const model of DELETE_MODELS) {
      expect(prisma[model]).toBeDefined();
      expect(typeof prisma[model].deleteMany).toBe('function');
      expect(typeof prisma[model].count).toBe('function');
    }
  });

  it('validates the authoritative directory: 7 cities and 68 real coffee shops', () => {
    const normalized = validateInput(directory);
    expect(normalized).toEqual(directory);
    expect(normalized.cities).toHaveLength(7);
    expect(normalized.cities.map((city: any) => [city.name, city.coffeeShops.length])).toEqual([
      ['Омск', 18], ['Москва', 16], ['Казань', 11], ['Санкт-Петербург', 5],
      ['Нижний Новгород', 4], ['Новосибирск', 8], ['Самара', 6],
    ]);
  });

  it.each([
    {}, { cities: [] }, { cities: [{ name: 'Омск', coffeeShops: [] }] },
    { cities: [{ name: ' ', coffeeShops: [{ name: 'Кофейня' }] }] },
    { cities: [{ name: 'Омск', coffeeShops: [{ name: 'Кофейня' }, { name: ' кофейня ' }] }] },
    { cities: [{ name: 'Омск', coffeeShops: [{ name: 'Кофейня' }] }, { name: ' омск ', coffeeShops: [{ name: 'Другая' }] }] },
    { cities: [{ name: 'Омск', coffeeShops: [{ name: 'Кофейня', password: 'unexpected' }] }] },
    { cities: [{ name: 'Омск\n', coffeeShops: [{ name: 'Кофейня' }] }] },
  ])('refuses invalid directory data before opening a transaction: %j', async input => {
    const db = database();
    await expect(prepareUserTest(db.prisma, { ...applyOptions, input })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires an explicit input and denies typo/repeated command arguments', () => {
    expect(parseArguments(['--input', 'directory.json'])).toEqual({ apply: false, requireReady: false, input: 'directory.json', help: false });
    expect(parseArguments(['--input', 'directory.json', '--require-ready'])).toEqual({ apply: false, requireReady: true, input: 'directory.json', help: false });
    expect(() => parseArguments([])).toThrow('--input');
    expect(() => parseArguments(['--input', 'directory.json', '--aplly'])).toThrow('Unknown');
    expect(() => parseArguments(['--input', 'directory.json', '--apply', '--apply'])).toThrow('Unknown');
    expect(() => parseArguments(['--input', 'directory.json', '--require-ready', '--require-ready'])).toThrow('Unknown');
  });

  it('requires both production hostname and exact confirmation for apply', () => {
    const args = ['--input', path.join(__dirname, '../../prisma/coffee-shop-directory.json'), '--apply'];
    expect(() => readOptions(args, { ADMIN_EMAIL: admin.email })).toThrow('CONFIRM_USER_TEST_RESET');
    expect(() => readOptions(args, { ADMIN_EMAIL: admin.email, CONFIRM_USER_TEST_RESET: TARGET_HOSTNAME, FRONTEND_URL: 'https://another.example.com' })).toThrow('FRONTEND_URL');
    const options = readOptions(args, { ADMIN_EMAIL: ' ADMIN@EXAMPLE.COM ', CONFIRM_USER_TEST_RESET: TARGET_HOSTNAME, FRONTEND_URL: 'https://lrt.scr-tech.ru/' });
    expect(options.adminEmail).toBe(admin.email);
    expect(options.input).toEqual(directory);
  });

  it('accepts a UTF-8 BOM from Windows and never uses invented fallback data', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lrt-preparation-test-'));
    const inputPath = path.join(folder, 'directory.json');
    try {
      fs.writeFileSync(inputPath, '\uFEFF' + JSON.stringify(sample));
      expect(readOptions(['--input', inputPath], { ADMIN_EMAIL: admin.email }).input).toEqual(sample);
      fs.writeFileSync(inputPath, 'not json');
      expect(() => readOptions(['--input', inputPath], { ADMIN_EMAIL: admin.email })).toThrow('valid UTF-8 JSON');
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
  });

  it('requires the apply confirmation and production hostname for the read-only readiness command', () => {
    const args = ['--input', path.join(__dirname, '../../prisma/coffee-shop-directory.json'), '--require-ready'];
    expect(() => readOptions(args, { ADMIN_EMAIL: admin.email })).toThrow('CONFIRM_USER_TEST_RESET');
    expect(() => readOptions(args, { ADMIN_EMAIL: admin.email, CONFIRM_USER_TEST_RESET: TARGET_HOSTNAME, FRONTEND_URL: 'https://another.example.com' })).toThrow('FRONTEND_URL');
    expect(readOptions(args, { ADMIN_EMAIL: admin.email, CONFIRM_USER_TEST_RESET: TARGET_HOSTNAME, FRONTEND_URL: 'https://lrt.scr-tech.ru/' })).toMatchObject({ apply: false, requireReady: true });
  });

  it('checks readiness without mutations and blocks repeat preparation before downtime is needed', async () => {
    const db = database();
    const before = db.snapshot();
    const readyOptions = { ...applyOptions, apply: false, requireReady: true };
    const plan = await prepareUserTest(db.prisma, readyOptions);
    expect(plan).toMatchObject({ mode: 'preview', canApply: true, alreadyPrepared: false });
    expect(db.operations).toEqual(['SET TRANSACTION READ ONLY']);
    expect(db.snapshot()).toEqual(before);
    const prepared = database({ systemSetting: [{ key: PREPARATION_KEY, value: '{}' }] });
    const preparedBefore = prepared.snapshot();
    await expect(prepareUserTest(prepared.prisma, readyOptions)).rejects.toMatchObject({ code: 'ALREADY_PREPARED' });
    expect(prepared.operations).toEqual(['SET TRANSACTION READ ONLY']);
    expect(prepared.snapshot()).toEqual(preparedBefore);
    await expect(prepareUserTest(db.prisma, { ...readyOptions, targetHostname: 'wrong.example.com' })).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  });

  it('previews deletions and additions using a read-only transaction without writing or exposing credentials', async () => {
    const db = database();
    const before = db.snapshot();
    const plan = await prepareUserTest(db.prisma, { input: sample, adminEmail: admin.email });
    expect(plan).toMatchObject({ mode: 'preview', canApply: true, alreadyPrepared: false, citiesToCreate: 1, coffeeShopsToCreate: 1, deletions: { user: 1, monthlyReport: 1 } });
    expect(plan.referenceDataToAdd.metricCodes).toHaveLength(9);
    expect(plan.referenceDataToAdd.analysisQuestionKeys).toHaveLength(24);
    expect(db.operations).toEqual(['SET TRANSACTION READ ONLY']);
    expect(db.snapshot()).toEqual(before);
    expect(JSON.stringify(plan)).not.toContain(passwordHash);
    expect(JSON.stringify(plan)).not.toContain('preserved-integration-settings');
  });

  it.each([
    [{ ...admin, role: 'COO' }, 'ADMIN_NOT_FOUND'],
    [{ ...admin, passwordHash: null }, 'ADMIN_LOGIN_UNAVAILABLE'],
    [{ ...admin, passwordHash: 'not a valid hash' }, 'ADMIN_LOGIN_UNAVAILABLE'],
  ])('refuses inaccessible administrator %# without any writes', async (user: any, code: any) => {
    const db = database({ user: [user] });
    const before = db.snapshot();
    await expect(prepareUserTest(db.prisma, applyOptions)).rejects.toMatchObject({ code });
    expect(db.operations.some(operation => operation.includes('.'))).toBe(false);
    expect(db.snapshot()).toEqual(before);
  });

  it('refuses missing or ambiguous administrator accounts', async () => {
    const missing = database({ user: [] });
    await expect(prepareUserTest(missing.prisma, applyOptions)).rejects.toMatchObject({ code: 'ADMIN_NOT_FOUND' });
    const ambiguous = database({ user: [admin, { ...admin, id: 10, email: 'ADMIN@EXAMPLE.COM' }] });
    await expect(prepareUserTest(ambiguous.prisma, applyOptions)).rejects.toMatchObject({ code: 'ADMIN_NOT_FOUND' });
  });

  it('preserves the administrator and all customized configuration, clearing data and creating only the supplied directory', async () => {
    const db = database();
    const before = db.snapshot();
    const result = await prepareUserTest(db.prisma, applyOptions);
    const after = db.snapshot();
    expect(result.mode).toBe('applied');
    expect(after.user).toEqual([admin]);
    for (const model of ['metric', 'analysisQuestion', 'triggerConfig']) expect(after[model][0]).toEqual(before[model][0]);
    for (const model of ['ratingColorConfig', 'coffeeShopCategory', 'metricThresholdOverride']) expect(after[model]).toEqual(before[model]);
    expect(after.systemSetting[0]).toEqual(before.systemSetting[0]);
    expect(after.systemSetting.find(row => row.key === PREPARATION_KEY)).toBeDefined();
    for (const model of DELETE_MODELS.filter((name: string) => !['city', 'coffeeShop', 'user'].includes(name))) expect(after[model]).toHaveLength(0);
    expect(after.city.map(row => row.name)).toEqual(['Омск']);
    expect(after.coffeeShop.map(row => [row.name, row.cityId])).toEqual([['Лермонтова', after.city[0].id]]);
    expect(after.metric).toHaveLength(10);
    expect(after.analysisQuestion).toHaveLength(25);
    expect(after.triggerConfig).toHaveLength(3);
    expect(db.operations.slice(0, 2)).toEqual(["SET LOCAL lock_timeout = '5000ms'", 'SELECT 1 AS locked FROM pg_advisory_xact_lock(584783965)']);
  });

  it('creates the baseline configuration when absent, including rating colors', async () => {
    const db = database({ metric: [], analysisQuestion: [], triggerConfig: [], ratingColorConfig: [] });
    await prepareUserTest(db.prisma, applyOptions);
    const after = db.snapshot();
    expect(after.metric).toHaveLength(10);
    expect(after.analysisQuestion).toHaveLength(25);
    expect(after.triggerConfig).toHaveLength(3);
    expect(after.ratingColorConfig).toEqual([{ id: 1, greenThreshold: 80, redThreshold: 60 }]);
  });

  it('does not replace a renamed metric code whose unique name already matches a reference metric', async () => {
    const custom = { id: 15, ...reference.metrics[0], code: 'CUSTOM_ENPS', thresholdStrong: 90 };
    const db = database({ metric: [custom] });
    await prepareUserTest(db.prisma, applyOptions);
    expect(db.snapshot().metric[0]).toEqual(custom);
    expect(db.snapshot().metric.filter(row => row.name === reference.metrics[0].name)).toHaveLength(1);
  });

  it('blocks a second reset even if a different directory is supplied and keeps later user data intact', async () => {
    const db = database({ systemSetting: [{ key: PREPARATION_KEY, value: '{"preparedAt":"2026-10-12"}' }] });
    const before = db.snapshot();
    const preview = await prepareUserTest(db.prisma, { input: sample, adminEmail: admin.email });
    expect(preview).toMatchObject({ alreadyPrepared: true, canApply: false });
    await expect(prepareUserTest(db.prisma, applyOptions)).rejects.toMatchObject({ code: 'ALREADY_PREPARED' });
    expect(db.snapshot()).toEqual(before);
    expect(db.operations.some(operation => operation.endsWith('.deleteMany'))).toBe(false);
  });

  it('rolls back deleted reports, users, configuration additions and completion marker if directory insertion fails', async () => {
    const db = database({}, 'coffeeShop.create');
    const before = db.snapshot();
    await expect(prepareUserTest(db.prisma, applyOptions)).rejects.toThrow('Simulated database write failure');
    expect(db.operations).toContain('monthlyReport.deleteMany');
    expect(db.operations).toContain('systemSetting.create');
    expect(db.snapshot()).toEqual(before);
  });

  it('blocks explicit demo seed scripts once preparation has completed', async () => {
    const findUnique = jest.fn().mockResolvedValue({ key: PREPARATION_KEY, value: '{}' });
    await expect(assertDemoSeedAllowed({ systemSetting: { findUnique } })).rejects.toMatchObject({ code: 'DEMO_SEED_BLOCKED' });
    expect(findUnique).toHaveBeenCalledWith({ where: { key: PREPARATION_KEY } });
    findUnique.mockResolvedValueOnce(null);
    await expect(assertDemoSeedAllowed({ systemSetting: { findUnique } })).resolves.toBeUndefined();
  });
});
