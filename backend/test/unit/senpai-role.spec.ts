import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { UserRole, isReadOnlyRole } from '../../src/common/enums/user-role.enum';
import { ReportsService } from '../../src/reports/reports.service';
import { AccessService } from '../../src/common/access.service';
import { CitiesController } from '../../src/cities/cities.controller';
import { getCurrentLeaders } from '../../src/ipv-triggers/trigger-evaluation';

// Swagger-декораторы не нужны в юнит-тесте и не загружаются в jest-окружении проекта.
jest.mock('@nestjs/swagger', () => new Proxy({}, { get: () => () => () => undefined }));

// Семпай закреплён за своей кофейней 3, а подопечные работают в других кофейнях.
const senpai = { id: 9, role: 'SENPAI', coffeeShopAssignments: [{ coffeeShopId: 3 }] };
const viewer = { id: 5, role: 'VIEWER' };

function context(user: any, method: string): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user, method }) }),
  } as any;
}

describe('Leader-senpai role', () => {
  describe('isReadOnlyRole', () => {
    it('is true for the viewer only: the senpai has his own shop and writes its report', () => {
      expect(isReadOnlyRole('VIEWER')).toBe(true);
      expect(isReadOnlyRole('SENPAI')).toBe(false);
      expect(isReadOnlyRole('COO')).toBe(false);
      expect(isReadOnlyRole(undefined)).toBe(false);
    });
  });

  describe('RolesGuard', () => {
    const guard = (roles?: UserRole[]) => new RolesGuard({ getAllAndOverride: jest.fn().mockReturnValue(roles) } as any);

    it('lets the senpai read endpoints that list the role', () => {
      expect(guard([UserRole.COO, UserRole.SENPAI]).canActivate(context(senpai, 'GET'))).toBe(true);
    });
    it('denies an endpoint that does not list the senpai role', () => {
      expect(() => guard([UserRole.COO]).canActivate(context(senpai, 'GET'))).toThrow(ForbiddenException);
      expect(() => guard([UserRole.COO]).canActivate(context(senpai, 'POST'))).toThrow(ForbiddenException);
    });
    it('lets the senpai write on endpoints that list the role (the report of his own shop)', () => {
      expect(guard([UserRole.LEADER, UserRole.SENPAI]).canActivate(context(senpai, 'POST'))).toBe(true);
    });
    it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('still denies %s for the viewer', (method) => {
      expect(() => guard(undefined).canActivate(context(viewer, method))).toThrow(ForbiddenException);
    });
    it('does not change access for the COO', () => {
      expect(guard([UserRole.COO]).canActivate(context({ id: 1, role: 'COO' }, 'POST'))).toBe(true);
    });
  });

  describe('ReportsService writes', () => {
    function setup(config = 'true') {
      const report: any = { id: 4, coffeeShopId: 8, year: 2026, month: 1, isLocked: true, status: 'SUBMITTED', revenue: 100, drinksCount: 10, metricValues: [], analyses: [], ratingSnapshot: { rating: 50 } };
      const prisma: any = {
        monthlyReport: { findUnique: jest.fn().mockResolvedValue(report), upsert: jest.fn() },
        metric: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const access: any = { requireReport: jest.fn().mockResolvedValue(report), requireShop: jest.fn().mockResolvedValue({ id: 8, isActive: true }) };
      const service = new ReportsService(prisma, access, { get: jest.fn().mockReturnValue(config) } as any);
      return { service, prisma, access };
    }

    it('refuses to create or update a draft in a shop that is not his own', async () => {
      const { service, prisma } = setup();
      await expect(service.createOrUpdateDraft({ coffeeShopId: 8, year: 2026, month: 10, revenue: 1 }, senpai)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.monthlyReport.upsert).not.toHaveBeenCalled();
    });
    it('refuses to submit the report of a supervised leader', async () => {
      const { service } = setup();
      await expect(service.submitReport(4, senpai)).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('lets the senpai write a draft in his own shop', async () => {
      const { service, access } = setup('false');
      access.requireShop.mockResolvedValue({ id: 3, isActive: true });
      // Дошли до проверки периода: запись в своей кофейне запрещена не ролью, а закрытым месяцем.
      await expect(service.createOrUpdateDraft({ coffeeShopId: 3, year: 2026, month: 1, revenue: 1 }, senpai)).rejects.toThrow(/Исторический/);
    });
    it('still refuses every write for the viewer', async () => {
      const { service } = setup();
      await expect(service.createOrUpdateDraft({ coffeeShopId: 8, year: 2026, month: 10, revenue: 1 }, viewer)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.submitReport(4, viewer)).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('marks a report editable only in the senpai own shop (viewer never)', async () => {
      const { service, prisma } = setup('true');
      expect(await service.getReportById(4, { id: 1, role: 'COO' })).toMatchObject({ isEditable: true });
      expect(await service.getReportById(4, senpai)).toMatchObject({ isEditable: false });
      prisma.monthlyReport.findUnique.mockResolvedValue({ id: 5, coffeeShopId: 3, year: 2026, month: 1, isLocked: true, status: 'SUBMITTED', revenue: 100, drinksCount: 10, metricValues: [], analyses: [], ratingSnapshot: { rating: 50 } });
      expect(await service.getReportById(5, senpai)).toMatchObject({ isEditable: true });
      expect(await service.getReportById(5, viewer)).toMatchObject({ isEditable: false });
    });
  });
});

describe('Senpai visibility', () => {
  const now = new Date('2026-11-18T10:00:00Z');
  beforeAll(() => { jest.useFakeTimers().setSystemTime(now); });
  afterAll(() => { jest.useRealTimers(); });

  // Своя кофейня + кофейни, где сейчас работают подопечные лидеры.
  const filter = {
    OR: [
      { id: { in: [3] } },
      {
        assignments: {
          some: {
            assignedFrom: { lte: now },
            OR: [{ assignedUntil: null }, { assignedUntil: { gt: now } }],
            user: { role: 'LEADER', supervisors: { some: { supervisorId: 9 } } },
          },
        },
      },
    ],
  };
  const prismaWith = (count: number) => ({
    coffeeShop: { findUnique: jest.fn().mockResolvedValue({ id: 8, cityId: 2 }), count: jest.fn().mockResolvedValue(count) },
  });

  it('does not see everything and cannot manage', () => {
    const service = new AccessService({} as any);
    expect(service.global(senpai)).toBe(false);
    expect(service.canManage(senpai)).toBe(false);
  });
  it('sees his own shop and the current shops of supervised leaders', () => {
    expect(new AccessService({} as any).shopWhere(senpai)).toEqual(filter);
  });
  it('without an own shop only the supervised shops remain', () => {
    const where = new AccessService({} as any).shopWhere({ id: 9, role: 'SENPAI' });
    expect(where.OR[0]).toEqual({ id: { in: [] } });
    expect(where.OR).toHaveLength(2);
  });
  it('requires an identity', () => {
    expect(() => new AccessService({} as any).shopWhere({ role: 'SENPAI' })).toThrow(ForbiddenException);
  });
  it('denies a shop that is neither his own nor supervised', async () => {
    const service = new AccessService(prismaWith(0) as any);
    await expect(service.requireShop(senpai, 8)).rejects.toThrow(ForbiddenException);
  });
  it('allows a visible shop', async () => {
    const prisma = prismaWith(1);
    await expect(new AccessService(prisma as any).requireShop(senpai, 8)).resolves.toEqual({ id: 8, cityId: 2 });
    expect(prisma.coffeeShop.count).toHaveBeenCalledWith({ where: { id: 8, ...filter } });
  });
  it('denies a city without visible shops', async () => {
    const prisma = prismaWith(0);
    await expect(new AccessService(prisma as any).requireCity(senpai, 2)).rejects.toThrow(ForbiddenException);
    expect(prisma.coffeeShop.count).toHaveBeenCalledWith({ where: { cityId: 2, ...filter } });
  });
  it('allows a city that has visible shops', async () => {
    await expect(new AccessService(prismaWith(1) as any).requireCity(senpai, 2)).resolves.toBeUndefined();
  });
  it('keeps global roles out of the database for city checks', async () => {
    const prisma = prismaWith(0);
    await expect(new AccessService(prisma as any).requireCity({ id: 1, role: 'COO' }, 2)).resolves.toBeUndefined();
    expect(prisma.coffeeShop.count).not.toHaveBeenCalled();
  });
  it('rejects a foreign city through the cities controller', async () => {
    const citiesService: any = { findOne: jest.fn() };
    const controller = new CitiesController(citiesService, new AccessService(prismaWith(0) as any));
    await expect(controller.findOne('5', senpai)).rejects.toThrow(ForbiddenException);
    expect(citiesService.findOne).not.toHaveBeenCalled();
  });
});

describe('Senpai personal results', () => {
  it('leader dashboard of a senpai is built as an ordinary leader: own shop only, mentees excluded', async () => {
    const { DashboardService } = require('../../src/dashboard/dashboard.service');
    const service = Object.create(DashboardService.prototype);
    service.getCityLeaderDashboard = jest.fn().mockResolvedValue('ok');
    await expect(service.getLeaderDashboard(senpai)).resolves.toBe('ok');
    expect(service.getCityLeaderDashboard).toHaveBeenCalledWith({ ...senpai, role: 'LEADER' });
    await service.getLeaderDashboard({ id: 1, role: 'LEADER' });
    expect(service.getCityLeaderDashboard).toHaveBeenLastCalledWith({ id: 1, role: 'LEADER' });
  });
});

describe('Senpai as the leader of his own shop', () => {
  const assignment = (role: string) => ({ assignedFrom: new Date('2026-01-01'), assignedUntil: null, user: { role } }) as any;
  it('counts a senpai as a current leader of the shop, like an ordinary leader', () => {
    const now = new Date('2026-11-18T10:00:00Z');
    expect(getCurrentLeaders([assignment('SENPAI')], now)).toHaveLength(1);
    expect(getCurrentLeaders([assignment('LEADER')], now)).toHaveLength(1);
    expect(getCurrentLeaders([assignment('COO'), assignment('CITY_LEADER'), assignment('VIEWER')], now)).toHaveLength(0);
  });
});
