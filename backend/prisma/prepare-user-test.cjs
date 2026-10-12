const fs = require('node:fs');
const crypto = require('node:crypto');
const { metrics, analysisQuestions, triggerConfigs, ratingColors } = require('./reference-config.cjs');

const PREPARATION_KEY = 'user_test_preparation_v1';
const TARGET_HOSTNAME = 'lrt.scr-tech.ru';
const DELETE_MODELS = [
  'comment', 'reportEditLog', 'reportAnalysis', 'metricValue', 'monthlyReport',
  'configChangeLog', 'notification', 'iPVStatus', 'passwordResetToken',
  'triggerExemption', 'reportLink', 'userCoffeeShopAssignment', 'userCityAssignment',
  'coffeeShop', 'city', 'user',
];

class PreparationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PreparationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PreparationError(code, message);
}

function validateName(value, context) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 255 || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail('INVALID_INPUT', `${context}: name must be a non-empty string of at most 255 characters.`);
  }
  return value.trim().normalize('NFC');
}

function exactKeys(value, expected, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !expected.includes(key))) {
    fail('INVALID_INPUT', `${context}: unexpected structure or fields.`);
  }
}

function validateInput(data) {
  exactKeys(data, ['cities'], 'Input');
  if (!Array.isArray(data.cities) || data.cities.length === 0) {
    fail('INVALID_INPUT', 'Input must contain at least one city with coffee shops.');
  }
  const cityNames = new Set();
  const cities = data.cities.map((city, cityIndex) => {
    const context = `City ${cityIndex + 1}`;
    exactKeys(city, ['name', 'coffeeShops'], context);
    const name = validateName(city.name, context);
    const key = name.toLocaleLowerCase('ru-RU');
    if (cityNames.has(key)) fail('INVALID_INPUT', `${context}: duplicate city name.`);
    cityNames.add(key);
    if (!Array.isArray(city.coffeeShops) || city.coffeeShops.length === 0) {
      fail('INVALID_INPUT', `${context}: at least one coffee shop is required.`);
    }
    const shopNames = new Set();
    const coffeeShops = city.coffeeShops.map((shop, shopIndex) => {
      const shopContext = `${context}, coffee shop ${shopIndex + 1}`;
      exactKeys(shop, ['name'], shopContext);
      const shopName = validateName(shop.name, shopContext);
      const shopKey = shopName.toLocaleLowerCase('ru-RU');
      if (shopNames.has(shopKey)) fail('INVALID_INPUT', `${shopContext}: duplicate coffee shop name within a city.`);
      shopNames.add(shopKey);
      return { name: shopName };
    });
    return { name, coffeeShops };
  });
  return { cities };
}

function parseArguments(args) {
  const options = { apply: false, requireReady: false, input: null, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' && !options.help) options.help = true;
    else if (argument === '--apply' && !options.apply) options.apply = true;
    else if (argument === '--require-ready' && !options.requireReady) options.requireReady = true;
    else if (argument === '--input' && options.input === null && args[index + 1] && !args[index + 1].startsWith('--')) options.input = args[++index];
    else fail('INVALID_ARGUMENTS', 'Use --input <JSON file> and optionally --apply or --require-ready. Unknown or repeated arguments are not allowed.');
  }
  if (!options.help && !options.input) fail('INVALID_ARGUMENTS', '--input <JSON file> is required.');
  return options;
}

function readOptions(args, env = process.env) {
  const options = parseArguments(args);
  if (options.help) return options;
  const adminEmail = typeof env.ADMIN_EMAIL === 'string' ? env.ADMIN_EMAIL.trim().toLowerCase() : '';
  if (!adminEmail || adminEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(adminEmail)) {
    fail('ADMIN_EMAIL_REQUIRED', 'ADMIN_EMAIL must identify the existing administrator to preserve.');
  }
  if (options.apply || options.requireReady) {
    if (env.CONFIRM_USER_TEST_RESET !== TARGET_HOSTNAME) {
      fail('CONFIRMATION_REQUIRED', `Applying requires CONFIRM_USER_TEST_RESET=${TARGET_HOSTNAME}.`);
    }
    let hostname;
    try { hostname = new URL(env.FRONTEND_URL).hostname; } catch { hostname = null; }
    if (hostname !== TARGET_HOSTNAME) {
      fail('WRONG_TARGET', `Applying requires FRONTEND_URL to use the hostname ${TARGET_HOSTNAME}.`);
    }
  }
  let input;
  try { input = JSON.parse(fs.readFileSync(options.input, 'utf8').replace(/^\uFEFF/u, '')); }
  catch { fail('INVALID_INPUT_FILE', 'The input file must exist and contain valid UTF-8 JSON.'); }
  return { ...options, adminEmail, input: validateInput(input) };
}

async function inspectPreparation(tx, input, adminEmail) {
  const completion = await tx.systemSetting.findUnique({ where: { key: PREPARATION_KEY } });
  const admins = await tx.user.findMany({
    where: { email: { equals: adminEmail, mode: 'insensitive' } },
    select: { id: true, name: true, email: true, role: true, passwordHash: true },
    take: 2,
  });
  if (admins.length !== 1 || admins[0].role !== 'ADMIN') {
    fail('ADMIN_NOT_FOUND', 'ADMIN_EMAIL must match exactly one existing ADMIN account.');
  }
  const admin = admins[0];
  if (typeof admin.passwordHash !== 'string' || !/^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/u.test(admin.passwordHash)) {
    fail('ADMIN_LOGIN_UNAVAILABLE', 'The preserved ADMIN must have a valid password login before preparation.');
  }
  const deletions = {};
  for (const model of DELETE_MODELS) {
    deletions[model] = await tx[model].count(model === 'user' ? { where: { id: { not: admin.id } } } : {});
  }
  const existingMetrics = await tx.metric.findMany({ select: { code: true, name: true } });
  const existingQuestions = await tx.analysisQuestion.findMany({ select: { questionKey: true } });
  const existingTriggers = await tx.triggerConfig.findMany({ select: { code: true } });
  const missingMetrics = metrics.filter(metric => !existingMetrics.some(existing => existing.code === metric.code || existing.name === metric.name));
  const missingQuestions = analysisQuestions.filter(question => !existingQuestions.some(existing => existing.questionKey === question.questionKey));
  const missingTriggers = triggerConfigs.filter(trigger => !existingTriggers.some(existing => existing.code === trigger.code));
  const hasColors = Boolean(await tx.ratingColorConfig.findFirst());
  const preservedConfiguration = {
    metrics: existingMetrics.length,
    analysisQuestions: existingQuestions.length,
    triggerConfigs: existingTriggers.length,
    ratingColors: await tx.ratingColorConfig.count(),
    coffeeShopCategories: await tx.coffeeShopCategory.count(),
    metricThresholdOverrides: await tx.metricThresholdOverride.count(),
    systemSettings: await tx.systemSetting.count(),
  };
  const { passwordHash: _, ...safeAdmin } = admin;
  return {
    plan: {
      mode: 'preview',
      canApply: !completion,
      alreadyPrepared: Boolean(completion),
      targetHostname: TARGET_HOSTNAME,
      inputSha256: crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex'),
      preservedAdmin: safeAdmin,
      deletions,
      preservedConfiguration,
      referenceDataToAdd: {
        metricCodes: missingMetrics.map(metric => metric.code),
        analysisQuestionKeys: missingQuestions.map(question => question.questionKey),
        triggerCodes: missingTriggers.map(trigger => trigger.code),
        ratingColors: !hasColors,
      },
      citiesToCreate: input.cities.length,
      coffeeShopsToCreate: input.cities.reduce((count, city) => count + city.coffeeShops.length, 0),
      directory: input,
    },
    completion,
    missingMetrics,
    missingQuestions,
    missingTriggers,
    hasColors,
  };
}

async function prepareUserTest(prisma, options) {
  const input = validateInput(options.input);
  if (!options.adminEmail) fail('ADMIN_EMAIL_REQUIRED', 'ADMIN_EMAIL is required.');
  if ((options.apply || options.requireReady) && (options.confirmation !== TARGET_HOSTNAME || options.targetHostname !== TARGET_HOSTNAME)) {
    fail('CONFIRMATION_REQUIRED', `Applying requires confirmation and FRONTEND_URL for ${TARGET_HOSTNAME}.`);
  }
  return prisma.$transaction(async tx => {
    if (options.apply) {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5000ms'");
      await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(584783965)');
    } else {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    }
    const inspected = await inspectPreparation(tx, input, options.adminEmail);
    if ((options.apply || options.requireReady) && inspected.completion) fail('ALREADY_PREPARED', 'Preparation has already completed. A second reset is blocked; update directories through the administrator interface.');
    if (!options.apply) return inspected.plan;
    const preparedAt = new Date().toISOString();
    await tx.systemSetting.create({ data: {
      key: PREPARATION_KEY,
      value: JSON.stringify({ preparedAt, adminId: inspected.plan.preservedAdmin.id, inputSha256: inspected.plan.inputSha256 }),
    } });
    for (const model of DELETE_MODELS) {
      await tx[model].deleteMany(model === 'user' ? { where: { id: { not: inspected.plan.preservedAdmin.id } } } : {});
    }
    for (const metric of inspected.missingMetrics) {
      await tx.metric.upsert({ where: { code: metric.code }, update: {}, create: metric });
    }
    for (const question of inspected.missingQuestions) {
      await tx.analysisQuestion.upsert({ where: { questionKey: question.questionKey }, update: {}, create: question });
    }
    for (const trigger of inspected.missingTriggers) {
      await tx.triggerConfig.upsert({ where: { code: trigger.code }, update: {}, create: trigger });
    }
    if (!inspected.hasColors) await tx.ratingColorConfig.create({ data: ratingColors });
    for (const city of input.cities) {
      const created = await tx.city.create({ data: { name: city.name, isActive: true } });
      for (const shop of city.coffeeShops) {
        await tx.coffeeShop.create({ data: { name: shop.name, cityId: created.id, isActive: true } });
      }
    }
    return { ...inspected.plan, mode: 'applied', canApply: false, alreadyPrepared: true, preparedAt };
  }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 120000 });
}

async function assertDemoSeedAllowed(prisma) {
  if (await prisma.systemSetting.findUnique({ where: { key: PREPARATION_KEY } })) {
    fail('DEMO_SEED_BLOCKED', 'Demo seeding is disabled after user-test preparation. Manage accounts and directories through the administrator interface.');
  }
}

async function run() {
  const options = readOptions(process.argv.slice(2));
  if (options.help) {
    console.log('Preview: ADMIN_EMAIL=<existing admin> node prisma/prepare-user-test.cjs --input <JSON file>\nReadiness check: add --require-ready; fails if already prepared and requires the same confirmation and target as apply, without changing data.\nApply: add --apply, CONFIRM_USER_TEST_RESET=lrt.scr-tech.ru, and FRONTEND_URL=https://lrt.scr-tech.ru.\nInput: {"cities":[{"name":"<real city>","coffeeShops":[{"name":"<real coffee shop>"}]}]}\nNever runs automatically. A completed preparation cannot be applied again.');
    return;
  }
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const plan = await prepareUserTest(prisma, {
      ...options,
      confirmation: process.env.CONFIRM_USER_TEST_RESET,
      targetHostname: options.apply || options.requireReady ? new URL(process.env.FRONTEND_URL).hostname : undefined,
    });
    console.log(JSON.stringify(plan, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  run().catch(error => {
    const known = error instanceof PreparationError;
    console.error(JSON.stringify({
      success: false,
      code: known ? error.code : 'PREPARATION_FAILED',
      message: known ? error.message : 'Database preparation failed; no changes were committed. Check connectivity and migration status.',
    }));
    process.exitCode = 1;
  });
}

module.exports = { PREPARATION_KEY, TARGET_HOSTNAME, DELETE_MODELS, PreparationError, validateInput, parseArguments, readOptions, prepareUserTest, assertDemoSeedAllowed };
