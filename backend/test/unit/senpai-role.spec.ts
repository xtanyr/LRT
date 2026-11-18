import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { UserRole, isReadOnlyRole } from '../../src/common/enums/user-role.enum';
import { ReportsService } from '../../src/reports/reports.service';
import { AccessService } from '../../src/common/access.service';
import { CitiesController } from '../../src/cities/cities.controller';

// Swagger-декораторы не нужны в юнит-тесте и не загружаются в jest-окружении проекта.
jest.mock('@nestjs/swagger', () => new Proxy({}, { get: () => () => () => undefined }));

const senpai = { id: 9, role: 'SENPAI' };

function context(user: any, method: string): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user, method }) }),
  } as any;
}

describe('Read-only senpai role', () => {
  describe('isReadOnlyRole', () => {
    it('is true for the viewer and the senpai only', () => {
      expect(isReadOnlyRole('VIEWER')).toBe(true);
      expect(isReadOnlyRole('SENPAI')).toBe(true);
      expect(isReadOnlyRole('COO')).toBe(false);
      expect(isReadOnlyRole(undefined)).toBe(false);
    });
  });

  describe('RolesGuard', () => {
    const guard = (roles?: UserRole[]) => new RolesGuard({ getAllAndOverride: jest.fn().mockReturnValue(roles) } as any);

    it('lets the senpai read endpoints that list the role', () => {
      expect(guard([UserRole.COO, UserRole.SENPAI]).canActivate(context(senpai, 'GET'))).toBe(true);
    });
    it('denies a read endpoint that does not list the senpai role', () => {
      expect(() => guard([UserRole.COO]).canActivate(context(senpai, 'GET'))).toThrow(ForbiddenException);
    });
    it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('denies %s even when the route has no role restriction', (method) => {
      expect(() => guard(undefined).canActivate(context(senpai, method))).toThrow(ForbiddenException);
    });
    it('denies a write even when the senpai role is listed by mistake', () => {
      expect(() => guard([UserRole.SENPAI]).canActivate(context(senpai, 'POST'))).toThrow(ForbiddenException);
    });
    it('does not change access for the COO', () => {
      expect(guard([UserRole.COO]).canActivate(context({ id: 1, role: 'COO' }, 'POST'))).toBe(true);
    });
  });

  describe('ReportsService', () => {
    function setup(config = 'true') {
      const report: any = { id: 4, coffeeShopId: 8, year: 2026, month: 1, isLocked: true, status: 'SUBMITTED', revenue: 100, drinksCount: 10, metricValues: [], analyses: [], ratingSnapshot: { rating: 50 } };
      const prisma: any = {
        monthlyReport: { findUnique: jest.fn().mockResolvedValue(report), upsert: jest.fn() },
        metric: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const access: any = { requireReport: jest.fn().mockResolvedValue(report), requireShop: jest.fn().mockResolvedValue({ id: 8, isActive: true }) };
      const service = new ReportsService(prisma, access, { get: jest.fn().mockReturnValue(config) } as any);
      return { service, prisma };
    }

    it('refuses to create or update a draft', async () => {
      const { service, prisma } = setup();
      await expect(service.createOrUpdateDraft({ coffeeShopId: 8, year: 2026, month: 10, revenue: 1 }, senpai)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.monthlyReport.upsert).not.toHaveBeenCalled();
    });
    it('refuses to submit a report', async () => {
      const { service } = setup();
      await expect(service.submitReport(4, senpai)).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('reports a report as not editable for the senpai even when historical editing is enabled', async () => {
      const { service } = setup('true');
      expect(await service.getReportById(4, { id: 1, role: 'COO' })).toMatchObject({ isEditable: true });
      expect(await service.getReportById(4, senpai)).toMatchObject({ isEditable: false });
    });
  });
});

describe('Senpai visibility', () => {
  const now = new Date('2026-11-18T10:00:00Z');
  beforeAll(() => { jest.useFakeTimers().setSystemTime(now); });
  afterAll(() => { jest.useRealTimers(); });

  const filter = {
    assignments: {
      some: {
        assignedFrom: { lte: now },
        OR: [{ assignedUntil: null }, { assignedUntil: { gt: now } }],
        user: { role: 'LEADER', supervisors: { some: { supervisorId: 9 } } },
      },
    },
  };
  const prismaWith = (count: number) => ({
    coffeeShop: { findUnique: jest.fn().mockResolvedValue({ id: 8, cityId: 2 }), count: jest.fn().mockResolvedValue(count) },
  });

  it('does not see everything and cannot manage', () => {
    const service = new AccessService({} as any);
    expect(service.global(senpai)).toBe(false);
    expect(service.canManage(senpai)).toBe(false);
  });
  it('limits shops to the current assignments of supervised leaders', () => {
    expect(new AccessService({} as any).shopWhere(senpai)).toEqual(filter);
  });
  it('requires an identity', () => {
    expect(() => new AccessService({} as any).shopWhere({ role: 'SENPAI' })).toThrow(ForbiddenException);
  });
  it('denies a shop outside the supervised leaders', async () => {
    const service = new AccessService(prismaWith(0) as any);
    await expect(service.requireShop(senpai, 8)).rejects.toThrow(ForbiddenException);
  });
  it('allows a supervised shop', async () => {
    const prisma = prismaWith(1);
    await expect(new AccessService(prisma as any).requireShop(senpai, 8)).resolves.toEqual({ id: 8, cityId: 2 });
    expect(prisma.coffeeShop.count).toHaveBeenCalledWith({ where: { id: 8, ...filter } });
  });
  it('denies a city without supervised shops', async () => {
    const prisma = prismaWith(0);
    await expect(new AccessService(prisma as any).requireCity(senpai, 2)).rejects.toThrow(ForbiddenException);
    expect(prisma.coffeeShop.count).toHaveBeenCalledWith({ where: { cityId: 2, ...filter } });
  });
  it('allows a city that has supervised shops', async () => {
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
