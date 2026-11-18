import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { UserRole, isReadOnlyRole } from '../../src/common/enums/user-role.enum';
import { ReportsService } from '../../src/reports/reports.service';

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
