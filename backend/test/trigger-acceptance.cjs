// Runs only against a fresh, disposable database whose name starts lrt_trigger_test.
// Root orchestration creates/removes its Postgres container; this file never uses the working database.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const testDatabaseUrl = process.env.NODEDATABASE_URL || process.env.DATABASE_URL;
if (!testDatabaseUrl || !/^lrt_trigger_test(?:_|$)/.test(new URL(testDatabaseUrl).pathname.slice(1))) {
  throw new Error('Refusing to run: an isolated lrt_trigger_test database is required');
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET ||= 'isolated-trigger-test-secret';

async function main() {
  try {
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { stdio: 'pipe', env: process.env });
  } catch (error) {
    throw new Error(`Isolated test database migration failed (exit ${error.status ?? 'unknown'})`);
  }
  require('reflect-metadata');
  const { NestFactory } = require('@nestjs/core');
  const { ValidationPipe } = require('@nestjs/common');
  const { SchedulerRegistry } = require('@nestjs/schedule');
  const { JwtService } = require('@nestjs/jwt');
  const { Prisma } = require('@prisma/client');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { TriggerMonitorService } = require('../dist/ipv-triggers/trigger-monitor.service');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1');
  app.get(SchedulerRegistry).getCronJobs().forEach(job => job.stop());
  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);
  const base = (await app.getUrl()) + '/api';
  let checks = 0;
  const ok = (condition, label) => { assert.ok(condition, label); checks++; };
  const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
  const now = new Date();
  const moscow = new Date(now.getTime() + 10800000);
  const endPeriod = moscow.getUTCFullYear() * 12 + moscow.getUTCMonth() - 1;
  const period = ordinal => ({ year: Math.floor(ordinal / 12), month: ordinal % 12 + 1 });
  const old = new Date('2024-01-01T00:00:00Z');
  let tokens;
  async function request(path, actor = 'cityA', method = 'GET', body, status = method === 'POST' ? 201 : 200) {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + tokens[actor] } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(json.message ?? '')}`);
    checks++;
    return json?.data === undefined ? json : json.data;
  }
  try {
    equal(await prisma.user.count(), 0, 'test database must start without users');
    equal(await prisma.coffeeShop.count(), 0, 'test database must start without shops');
    const configs = await prisma.triggerConfig.findMany({ orderBy: { code: 'asc' } });
    equal(configs.map(config => [config.code, Number(config.thresholdRating), config.monthsCount, config.minMonthsOnPosition, config.minMonthsSinceApproval, config.isActive]), [
      ['T1', 60, 3, 6, 6, true], ['T2', 80, 12, 6, 6, true], ['T3', 0, 3, 6, 6, true],
    ], 'startup installs the final approved defaults');
    const users = {};
    for (const [key, role] of [['admin', 'ADMIN'], ['coo', 'COO'], ['cityA', 'CITY_LEADER'], ['cityB', 'CITY_LEADER'], ['leaderA', 'LEADER'], ['leaderB', 'LEADER'], ['ended', 'LEADER'], ['future', 'LEADER'], ['newUnapproved', 'LEADER']]) {
      users[key] = await prisma.user.create({ data: { name: 'Trigger test ' + key, email: `${key}@trigger-test.example`, role, approvedAt: ['ended', 'future', 'newUnapproved'].includes(key) ? null : old } });
    }
    tokens = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([key, user]) => [key, await jwt.signAsync({ sub: user.id, role: user.role, email: user.email })])));
    const cityA = await prisma.city.create({ data: { name: 'Trigger Test A' } });
    const cityB = await prisma.city.create({ data: { name: 'Trigger Test B' } });
    const shopA = await prisma.coffeeShop.create({ data: { name: 'Trigger Shop A', cityId: cityA.id } });
    const shopB = await prisma.coffeeShop.create({ data: { name: 'Trigger Shop B', cityId: cityB.id } });
    await prisma.userCityAssignment.createMany({ data: [{ userId: users.cityA.id, cityId: cityA.id, assignedFrom: old }, { userId: users.cityB.id, cityId: cityB.id, assignedFrom: old }] });
    await prisma.userCityAssignment.createMany({ data: [
      { userId: users.coo.id, cityId: cityA.id, assignedFrom: old },
      { userId: users.leaderA.id, cityId: cityA.id, assignedFrom: old },
      { userId: users.cityB.id, cityId: cityA.id, assignedFrom: new Date(now.getTime() + 90 * 86400000) },
    ] });
    const assignmentA = await prisma.userCoffeeShopAssignment.create({ data: { userId: users.leaderA.id, coffeeShopId: shopA.id, assignedFrom: old } });
    await prisma.userCoffeeShopAssignment.create({ data: { userId: users.leaderB.id, coffeeShopId: shopB.id, assignedFrom: old } });
    await prisma.userCoffeeShopAssignment.create({ data: { userId: users.ended.id, coffeeShopId: shopA.id, assignedFrom: old, assignedUntil: new Date(now.getTime() - 86400000) } });
    await prisma.userCoffeeShopAssignment.create({ data: { userId: users.future.id, coffeeShopId: shopA.id, assignedFrom: new Date(now.getTime() + 90 * 86400000) } });
    const newAssignment = await prisma.userCoffeeShopAssignment.create({ data: { userId: users.newUnapproved.id, coffeeShopId: shopA.id, assignedFrom: new Date(now.getTime() - 10 * 86400000) } });
    await prisma.triggerExemption.create({ data: { userId: users.ended.id, setById: users.admin.id, reason: 'Historical assignment must not block a current leader' } });
    const metric = await prisma.metric.create({ data: { name: 'Тест ENPS', code: 'ENPS', unit: '%', thresholdStrong: 70, thresholdMedium: 50, pointsStrong: 10, pointsMedium: 5, pointsCritical: 0 } });
    const otherMetric = await prisma.metric.create({ data: { name: 'Тест списаний', code: 'DESSERT_WRITEOFF', unit: '%', direction: 'LOWER_IS_BETTER', thresholdStrong: 1, thresholdMedium: 2, pointsStrong: 10, pointsMedium: 5, pointsCritical: 0 } });
    const scope = id => `?coffeeShopId=${id}`;
    const evaluate = (actor = 'cityA', id = shopA.id) => request('/ipv-triggers/evaluate' + (id === null ? '' : scope(id)), actor, 'POST', {});
    const statuses = (actor = 'cityA', id = shopA.id) => request('/ipv-triggers/statuses' + (id === null ? '' : scope(id)), actor);
    const diagnostics = (actor = 'cityA', id = shopA.id) => request('/ipv-triggers/diagnostics' + scope(id), actor);
    async function reset() {
      await prisma.notification.deleteMany();
      await prisma.iPVStatus.deleteMany();
      await prisma.systemSetting.deleteMany({ where: { key: { startsWith: 'ipv:' } } });
      await prisma.monthlyReport.deleteMany();
    }
    async function reports(ratings, { shopId = shopA.id, critical = false, status = 'SUBMITTED', offset = 0 } = {}) {
      const rows = [];
      for (let index = 0; index < ratings.length; index++) {
        const selected = period(endPeriod + offset - ratings.length + 1 + index);
        const rating = ratings[index];
        rows.push(await prisma.monthlyReport.create({ data: {
          coffeeShopId: shopId, ...selected, revenue: 100000, status, isLocked: true,
          submittedAt: status === 'SUBMITTED' ? now : null, submittedById: shopId === shopA.id ? users.leaderA.id : users.leaderB.id,
          ratingSnapshot: { rating, results: [{ metricId: metric.id, code: 'ENPS', name: metric.name, zone: critical ? 'CRITICAL' : 'STRONG', points: critical ? 0 : 10 }] },
        } }));
      }
      return rows;
    }

    await request('/ipv-triggers/statuses', null, 'GET', undefined, 401);
    await request('/ipv-triggers/statuses', 'leaderA', 'GET', undefined, 403);
    equal((await request('/ipv-triggers/config', 'admin')).length, 3, 'admin can read initialized rules');
    await reports([55, 50, 45]);
    await evaluate();
    let events = await statuses();
    equal(events.map(event => event.triggerCode), ['T1'], 'ended, future and unapproved co-leaders do not block a qualified current leader');
    equal(await prisma.notification.count({ where: { userId: users.cityA.id, isRead: false } }), 1, 'city leader receives one T1 notification');
    equal(await prisma.notification.count({ where: { userId: users.cityB.id } }), 0, 'other city receives no notification');
    equal(await prisma.notification.count({ where: { userId: { in: [users.coo.id, users.leaderA.id] } } }), 0, 'historical city assignments of users with another role receive no notification');

    await reset(); await reports([45, 55, 50]); await evaluate();
    equal((await statuses()).length, 0, 'growth cancels T1');
    await reset(); await reports(Array.from({ length: 12 }, (_, index) => 30 + index)); await evaluate();
    equal((await statuses()).map(event => event.triggerCode), ['T2'], 'twelve consecutive ratings below 80 trigger T2 despite growth');
    await reset(); await reports([90, 90, 90], { critical: true }); await evaluate();
    events = await statuses();
    equal(events.map(event => [event.triggerCode, event.metricId, event.metricName]), [['T3', metric.id, metric.name]], 'T3 exposes its common metric rather than rating < 0');
    ok(events[0].triggeredAt && Number.isFinite(Date.parse(events[0].triggeredAt)), 'event exposes its firing timestamp');
    const overdueAt = new Date(now.getTime() - 15 * 86400000);
    await prisma.iPVStatus.update({ where: { id: events[0].id }, data: { triggeredAt: overdueAt } });
    await evaluate();
    const overdue = (await statuses())[0];
    equal(overdue.daysOverdue, 1, 'fifteen days without starting IPV expose one overdue day');
    equal(overdue.status, 'NOT_STARTED', 'overdue stays a visual state rather than an automatic status transition');
    equal(overdue.triggeredAt, overdueAt.toISOString(), 'overdue evaluation preserves the original firing timestamp');
    equal(await prisma.notification.count(), 1, 'overdue does not duplicate or escalate notifications');
    await reset();
    const changingMetrics = await reports([90, 90, 90], { critical: true });
    await prisma.monthlyReport.update({ where: { id: changingMetrics[1].id }, data: { ratingSnapshot: { rating: 90, results: [{ metricId: otherMetric.id, code: otherMetric.code, zone: 'CRITICAL' }] } } });
    await evaluate(); equal((await statuses()).length, 0, 'different critical metrics do not trigger T3');
    await reset(); await reports([60, 60, 60]); await evaluate();
    equal((await statuses()).length, 0, 'rating equal to 60 does not trigger T1');
    await reset(); await reports(Array(12).fill(80)); await evaluate();
    equal((await statuses()).length, 0, 'rating equal to 80 does not trigger T2');

    await reset(); await reports([50, 50, 50], { critical: true }); await evaluate();
    events = await statuses();
    equal(events.map(event => event.triggerCode).sort(), ['T1', 'T3'], 'simultaneous conditions preserve both pending events');
    const firstDates = events.map(event => [event.id, event.triggeredAt]).sort();
    await Promise.all([evaluate(), evaluate()]);
    equal((await statuses()).map(event => [event.id, event.triggeredAt]).sort(), firstDates, 'repeat and concurrent requests do not overwrite pending dates');
    equal(await prisma.notification.count(), 2, 'repeat and concurrent evaluations do not duplicate notifications');
    const t1Event = events.find(event => event.triggerCode === 'T1');
    const t3Event = events.find(event => event.triggerCode === 'T3');
    await request(`/ipv-triggers/status/${t1Event.id}`, 'cityA', 'PATCH', { status: 'COMPLETED', closeReason: 'Skipped start' }, 400);
    await request(`/notifications/${(await request('/notifications')).find(notification => notification.ipvStatusId === t1Event.id).id}/read`, 'cityA', 'PATCH', {}, 400);
    await request(`/ipv-triggers/status/${t1Event.id}`, 'cityA', 'PATCH', { status: 'IN_PROGRESS' });
    equal((await request('/notifications')).filter(notification => notification.ipvStatusId === t1Event.id).every(notification => notification.isRead), true, 'starting IPV clears its active notification');
    equal(await request('/notifications/unread-count'), 0, 'opening the shop IPV dismisses all simultaneous reasons');
    equal((await statuses()).map(event => event.status), ['IN_PROGRESS', 'IN_PROGRESS'], 'all reasons share one shop IPV');
    await request(`/ipv-triggers/status/${t3Event.id}`, 'cityA', 'PATCH', { status: 'IN_PROGRESS' }, 400);
    await prisma.monthlyReport.deleteMany();
    await reports(Array.from({ length: 12 }, (_, index) => 30 + index));
    await evaluate();
    equal((await statuses()).length, 2, 'IN_PROGRESS prevents a newly matching T2 event');
    await request(`/ipv-triggers/status/${t1Event.id}`, 'cityA', 'PATCH', { status: 'COMPLETED' }, 400);
    await request(`/ipv-triggers/status/${t1Event.id}`, 'cityA', 'PATCH', { status: 'COMPLETED', closeReason: 'План выполнен' });
    equal((await statuses()).map(event => [event.status, event.closeReason]), [['COMPLETED', 'План выполнен'], ['COMPLETED', 'План выполнен']], 'completion clears every reason and preserves the shared outcome');
    equal((await statuses()).find(event => event.id === t1Event.id).closeReason, 'План выполнен', 'completion outcome persists and is returned');
    await request(`/ipv-triggers/status/${t1Event.id}`, 'cityA', 'PATCH', { status: 'COMPLETED', closeReason: 'Duplicate' }, 400);
    await prisma.monthlyReport.deleteMany(); await reports([50, 50, 50], { critical: true }); await evaluate();
    equal((await statuses()).find(event => event.id === t1Event.id).status, 'COMPLETED', 'completed IPV cannot reopen for the same report window');
    const nextMoscowMonth = new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth() + 1, 5, 9));
    await reports([50], { critical: true, offset: 1 });
    await app.get(TriggerMonitorService).evaluate(nextMoscowMonth, [shopA.id]);
    const reopened = await prisma.iPVStatus.findUnique({ where: { id: t1Event.id } });
    equal([reopened.status, reopened.statusChangedAt, reopened.statusChangedBy], ['NOT_STARTED', null, null], 'new window reopens completed IPV with fresh workflow metadata');
    equal(reopened.triggeredAt.toISOString(), nextMoscowMonth.toISOString(), 'new window captures its evaluation timestamp');

    // The active unapproved co-leader must not keep an eligible leader's pending signals visible.
    const flag = await request('/ipv-triggers/exemptions', 'cityA', 'POST', { userId: users.leaderA.id, reason: 'Временное ручное исключение' });
    equal((await statuses()).length, 0, 'manual exemption hides existing pending statuses');
    equal((await request('/dashboard/city-leader')).ipvStatuses.length, 0, 'manual exemption hides dashboard indicators');
    equal(await request('/notifications/unread-count'), 0, 'manual exemption hides unread notification count');
    equal((await request('/notifications')).filter(notification => !notification.isRead).length, 0, 'manual exemption hides active banners');
    await request(`/ipv-triggers/status/${t3Event.id}`, 'cityA', 'PATCH', { status: 'IN_PROGRESS' }, 400);
    ok((await diagnostics())[0].checks.some(check => check.reasons.some(reason => /исключение/i.test(reason))), 'diagnostics explain the active exemption');
    await request(`/ipv-triggers/exemptions/${flag.id}/clear`, 'cityA', 'PATCH', {});
    equal((await statuses()).length, 2, 'clearing exemption restores saved pending statuses');
    ok((await request('/notifications/unread-count')) > 0, 'clearing exemption restores active notification count');
    equal((await request('/ipv-triggers/exemptions')).length, 0, 'historical leader exemption does not appear in current scope');

    await reset();
    let createdReports = await reports([50, 50, 50]);
    await prisma.monthlyReport.update({ where: { id: createdReports[1].id }, data: { status: 'NOT_FILLED', submittedAt: null } });
    await evaluate(); equal((await statuses()).length, 0, 'a draft interrupts the consecutive window');
    ok((await diagnostics())[0].checks.find(check => check.code === 'T1').reasons.some(reason => /отправленных отчётов/i.test(reason)), 'diagnostics name missing submitted months');
    await prisma.monthlyReport.delete({ where: { id: createdReports[1].id } });
    await evaluate(); equal((await statuses()).length, 0, 'a missing month interrupts the consecutive window');
    await reset(); createdReports = await reports([50, 50, 50]);
    await prisma.monthlyReport.update({ where: { id: createdReports[1].id }, data: { ratingSnapshot: Prisma.DbNull } });
    await evaluate(); equal((await statuses()).length, 0, 'a missing saved rating cannot generate events');
    ok((await diagnostics())[0].checks.find(check => check.code === 'T1').reasons.some(reason => /сохранённого рейтинга/i.test(reason)), 'diagnostics explain a submitted report without a snapshot');

    await reset(); await reports([50, 50, 50]); await reports([50, 50, 50], { shopId: shopB.id });
    await evaluate('cityA', null);
    equal((await prisma.iPVStatus.findMany()).map(event => event.coffeeShopId), [shopA.id], 'unfiltered city-leader evaluation is restricted to assigned city');
    await request('/ipv-triggers/statuses' + scope(shopB.id), 'cityA', 'GET', undefined, 403);
    await request('/ipv-triggers/diagnostics' + scope(shopB.id), 'cityA', 'GET', undefined, 403);
    await request('/ipv-triggers/evaluate' + scope(shopB.id), 'cityA', 'POST', {}, 403);
    await evaluate('cityB', shopB.id);
    equal((await statuses('coo', null)).length, 2, 'COO sees both cities');
    equal((await statuses('coo', shopB.id)).map(event => event.coffeeShopId), [shopB.id], 'shop query actually filters statuses');
    await request('/ipv-triggers/statuses?coffeeShopId=1oops', 'cityA', 'GET', undefined, 400);

    await reset(); await reports([50, 50, 50]);
    await prisma.userCoffeeShopAssignment.update({ where: { id: assignmentA.id }, data: { assignedUntil: now } });
    await prisma.userCoffeeShopAssignment.update({ where: { id: newAssignment.id }, data: { assignedUntil: null } });
    let diagnostic = (await diagnostics())[0];
    ok(diagnostic.checks.find(check => check.code === 'T1').reasons.some(reason => /не указана дата утверждения/i.test(reason)), 'missing approval has an explicit diagnostic');
    await evaluate(); equal((await statuses()).length, 0, 'missing approval does not generate an event');
    const recent = new Date(now.getTime() - 86400000);
    await prisma.user.update({ where: { id: users.newUnapproved.id }, data: { approvedAt: recent } });
    diagnostic = (await diagnostics())[0];
    ok(diagnostic.checks.find(check => check.code === 'T1').reasons.some(reason => /стаж.*6 мес/i.test(reason)), 'insufficient position tenure has an explicit diagnostic');
    ok(diagnostic.checks.find(check => check.code === 'T1').reasons.some(reason => /после утверждения.*6 мес/i.test(reason)), 'insufficient approval tenure has an explicit diagnostic');
    await prisma.userCoffeeShopAssignment.update({ where: { id: newAssignment.id }, data: { assignedUntil: now } });
    await prisma.userCoffeeShopAssignment.update({ where: { id: assignmentA.id }, data: { assignedUntil: null } });

    const configT1 = configs.find(config => config.code === 'T1');
    for (const payload of [{ monthsCount: 0 }, { monthsCount: 1.5 }, { minMonthsOnPosition: -1 }, { thresholdRating: 101 }, { isActive: 'false' }, { code: 'T2' }, {}]) await request(`/ipv-triggers/config/${configT1.id}`, 'admin', 'PATCH', payload, 400);
    await request(`/ipv-triggers/config/${configT1.id}`, 'cityA', 'PATCH', { isActive: false }, 403);
    await request(`/ipv-triggers/config/${configT1.id}`, 'coo', 'PATCH', { thresholdRating: 55, monthsCount: 3, minMonthsOnPosition: 6, minMonthsSinceApproval: 6, isActive: false });
    await app.get(TriggerMonitorService).onModuleInit();
    const edited = (await request('/ipv-triggers/config', 'admin')).find(config => config.code === 'T1');
    equal([Number(edited.thresholdRating), edited.isActive], [55, false], 'startup defaults preserve user-edited and disabled rules');
    await evaluate(); equal((await statuses()).length, 0, 'disabled T1 generates no event');
    ok((await diagnostics())[0].checks.find(check => check.code === 'T1').reasons.some(reason => /правило отключено/i.test(reason)), 'diagnostics explain disabled rule');
    ok(await prisma.configChangeLog.count({ where: { fieldChanged: 'trigger:' + configT1.id } }), 'configuration changes are audited');
    console.log(`Trigger acceptance passed: ${checks} assertions; real Postgres migrations, Nest HTTP, T1/T2/T3, lifecycle, idempotency, scopes, exemptions, diagnostics and configuration.`);
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error(error.name + ': ' + error.message);
  process.exitCode = 1;
});
