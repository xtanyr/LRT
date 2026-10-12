const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { readUatSeedEnv } = require('./uat-seed-env.cjs');
const { assertDemoSeedAllowed } = require('./prepare-user-test.cjs');

const { password: PASSWORD, year: YEAR } = readUatSeedEnv();
const prisma = new PrismaClient();

const people = [
  { name: 'Анна Лебедева', email: 'anna.lebedeva.test@skuratovcoffee.ru', city: 'Москва', shop: 'Coffee Shop 1', base: 88 },
  { name: 'Максим Орлов', email: 'maxim.orlov.test@skuratovcoffee.ru', city: 'Москва', shop: 'Coffee Shop 2', base: 74 },
  { name: 'Елена Волкова', email: 'elena.volkova.test@skuratovcoffee.ru', city: 'Санкт-Петербург', shop: 'Coffee Shop 3', base: 93 },
  { name: 'Илья Соколов', email: 'ilya.sokolov.test@skuratovcoffee.ru', city: 'Санкт-Петербург', shop: 'Coffee Shop 4', base: 66 },
];
const monthlyDelta = [-8, -4, 0, 5, 8, 3, -2, 6, 10, 4, -5, 2];

function scoreFor(base, month) {
  return Math.max(30, Math.min(100, base + monthlyDelta[month - 1]));
}

function metricValue(metric, score) {
  const strong = Number(metric.thresholdStrong);
  const medium = Number(metric.thresholdMedium);
  if (metric.direction === 'LOWER_IS_BETTER') {
    if (score >= 80) return Math.max(0.1, strong * 0.8);
    if (score >= 60) return (strong + medium) / 2;
    return medium * 1.35;
  }
  if (score >= 80) return strong;
  if (score >= 60) return medium;
  return medium * 0.7;
}

async function ensureShop(name, cityId) {
  const existing = await prisma.coffeeShop.findFirst({ where: { name, cityId } });
  if (existing) return prisma.coffeeShop.update({ where: { id: existing.id }, data: { isActive: true } });
  return prisma.coffeeShop.create({ data: { name, cityId } });
}

async function main() {
  await assertDemoSeedAllowed(prisma);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const metrics = await prisma.metric.findMany({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } });
  if (!metrics.length) throw new Error('Run the base seed before the yearly demo seed.');

  for (const person of people) {
    const city = await prisma.city.upsert({ where: { name: person.city }, update: { isActive: true }, create: { name: person.city } });
    const shop = await ensureShop(person.shop, city.id);
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: { name: person.name, passwordHash, role: UserRole.LEADER, approvedAt: new Date(Date.UTC(YEAR, 0, 1)) },
      create: { name: person.name, email: person.email, passwordHash, role: UserRole.LEADER, approvedAt: new Date(Date.UTC(YEAR, 0, 1)) },
    });
    const assignment = await prisma.userCoffeeShopAssignment.findFirst({ where: { userId: user.id, coffeeShopId: shop.id, assignedUntil: null } });
    if (!assignment) await prisma.userCoffeeShopAssignment.create({ data: { userId: user.id, coffeeShopId: shop.id, assignedFrom: new Date(Date.UTC(YEAR, 0, 1)) } });

    for (let month = 1; month <= 12; month += 1) {
      const rating = scoreFor(person.base, month);
      const zone = rating >= 80 ? 'TARGET' : rating >= 60 ? 'BELOW_TARGET' : 'CRITICAL';
      const results = metrics.map((metric) => ({ metricId: metric.id, zone, pointsAwarded: Number((rating / metrics.length).toFixed(2)), computedPercent: null }));
      const values = metrics.map((metric) => ({ metricId: metric.id, absoluteValue: metricValue(metric, rating), zone, pointsAwarded: Number((rating / metrics.length).toFixed(2)) }));
      const submittedAt = new Date(Date.UTC(YEAR, month, 5, 9));
      const reportData = {
        revenue: 900000 + shop.id * 65000 + month * 22000,
        drinksCount: 9500 + shop.id * 350 + month * 180,
        status: 'SUBMITTED',
        isLocked: month < 8,
        submittedAt,
        submittedById: user.id,
        formData: { revenuePlan: 950000 + shop.id * 65000 + month * 22000, drinksPlan: 10000 + shop.id * 350 + month * 180 },
        ratingSnapshot: { rating, results },
      };
      await prisma.monthlyReport.upsert({
        where: { coffeeShopId_year_month: { coffeeShopId: shop.id, year: YEAR, month } },
        create: {
          coffeeShopId: shop.id, year: YEAR, month, ...reportData,
          metricValues: { create: values },
          analyses: { create: { questionKey: 'summary_actions', content: `План действий ${person.name}, ${month}/${YEAR}: сохранить сильные показатели и разобрать отклонения.` } },
        },
        update: {
          ...reportData,
          metricValues: { deleteMany: {}, create: values },
          analyses: { deleteMany: {}, create: { questionKey: 'summary_actions', content: `План действий ${person.name}, ${month}/${YEAR}: сохранить сильные показатели и разобрать отклонения.` } },
        },
      });
    }
  }
  console.log(`Yearly demo ready: ${people.length} leaders, ${people.length * 12} submitted reports for ${YEAR}.`);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
