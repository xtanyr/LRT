const { PrismaClient, UserRole, ReportLinkType } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { readUatSeedEnv } = require('./uat-seed-env.cjs');
const { metrics, triggerConfigs, analysisQuestions, ratingColors } = require('./reference-config.cjs');
const { assertDemoSeedAllowed } = require('./prepare-user-test.cjs');

const { password } = readUatSeedEnv();
const prisma = new PrismaClient();

async function main() {
  await assertDemoSeedAllowed(prisma);
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@skuratovcoffee.ru' },
    update: {},
    create: {
      name: 'Administrator',
      email: 'admin@skuratovcoffee.ru',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });
  console.log('Created admin user:', admin.email);

  const coo = await prisma.user.upsert({
    where: { email: 'coo@skuratovcoffee.ru' },
    update: {},
    create: {
      name: 'COO User',
      email: 'coo@skuratovcoffee.ru',
      passwordHash,
      role: UserRole.COO,
    },
  });
  console.log('Created COO user:', coo.email);

  const cityLeader = await prisma.user.upsert({
    where: { email: 'cityleader@skuratovcoffee.ru' },
    update: {},
    create: {
      name: 'City Leader',
      email: 'cityleader@skuratovcoffee.ru',
      passwordHash,
      role: UserRole.CITY_LEADER,
    },
  });
  console.log('Created city leader user:', cityLeader.email);

  const leader = await prisma.user.upsert({
    where: { email: 'leader@skuratovcoffee.ru' },
    update: {},
    create: {
      name: 'Coffee Shop Leader',
      email: 'leader@skuratovcoffee.ru',
      passwordHash,
      role: UserRole.LEADER,
    },
  });
  console.log('Created leader user:', leader.email);

  const moscow = await prisma.city.upsert({
    where: { name: 'Москва' },
    update: {},
    create: { name: 'Москва' },
  });
  console.log('Created city:', moscow.name);

  const spb = await prisma.city.upsert({
    where: { name: 'Санкт-Петербург' },
    update: {},
    create: { name: 'Санкт-Петербург' },
  });
  console.log('Created city:', spb.name);

  const kazan = await prisma.city.upsert({
    where: { name: 'Казань' },
    update: {},
    create: { name: 'Казань' },
  });
  console.log('Created city:', kazan.name);

  const coffeeShop1 = await prisma.coffeeShop.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Coffee Shop 1', cityId: moscow.id },
  });
  console.log('Created coffee shop:', coffeeShop1.name);

  const coffeeShop2 = await prisma.coffeeShop.upsert({
    where: { id: 2 },
    update: {},
    create: { name: 'Coffee Shop 2', cityId: moscow.id },
  });
  console.log('Created coffee shop:', coffeeShop2.name);

  const coffeeShop3 = await prisma.coffeeShop.upsert({
    where: { id: 3 },
    update: {},
    create: { name: 'Coffee Shop 3', cityId: spb.id },
  });
  console.log('Created coffee shop:', coffeeShop3.name);

  await prisma.userCityAssignment.upsert({
    where: { userId_cityId: { userId: cityLeader.id, cityId: moscow.id } },
    update: {},
    create: { userId: cityLeader.id, cityId: moscow.id },
  });
  console.log('Assigned city leader to Moscow');

  console.log('Created leader role account without a coffee shop assignment');



  for (const metricData of metrics) {
    await prisma.metric.upsert({
      where: { code: metricData.code },
      update: metricData,
      create: metricData,
    });
  }
  console.log(`Upserted ${metrics.length} metrics`);

  await prisma.ratingColorConfig.upsert({
    where: { id: 1 },
    update: {},
    create: ratingColors,
  });
  console.log('Created rating color config');



  for (const config of triggerConfigs) {
    await prisma.triggerConfig.upsert({
      where: { code: config.code },
      update: {},
      create: config,
    });
  }
  console.log(`Created ${triggerConfigs.length} trigger configs`);



  for (const q of analysisQuestions) {
    await prisma.analysisQuestion.upsert({
      where: { questionKey: q.questionKey },
      update: {},
      create: q,
    });
  }
  console.log(`Created ${analysisQuestions.length} analysis questions`);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  await prisma.monthlyReport.upsert({
    where: { coffeeShopId_year_month: { coffeeShopId: coffeeShop1.id, year: currentYear, month: currentMonth } },
    update: {},
    create: {
      coffeeShopId: coffeeShop1.id,
      year: currentYear,
      month: currentMonth,
      revenue: 1000000,
      drinksCount: 12000,
      status: 'NOT_FILLED',
    },
  });
  console.log('Created sample report for Coffee Shop 1');

  await prisma.reportLink.upsert({
    where: { id: 1 },
    update: {},
    create: {
      coffeeShopId: coffeeShop1.id,
      linkType: ReportLinkType.GIFT_REASONS,
      url: 'https://example.com/gift-reasons',
    },
  });
  console.log('Created sample report link');

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
