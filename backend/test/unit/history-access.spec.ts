// Swagger documentation is unrelated to authorization and cannot load its UI in Jest.
jest.mock('@nestjs/swagger', () => ({
  ApiTags: () => () => undefined,
  ApiBearerAuth: () => () => undefined,
  ApiOperation: () => () => undefined,
  ApiBody: () => () => undefined,
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
}));

import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { AdminController } from '../../src/admin/admin.controller';
import { UserRole } from '../../src/common/enums/user-role.enum';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { ReportsController } from '../../src/reports/reports.controller';

const historyEndpoints = [
  {
    route: 'GET /reports/edit-logs',
    controller: ReportsController,
    handler: ReportsController.prototype.getAllEditLogs,
  },
  {
    route: 'GET /reports/:id/edit-logs',
    controller: ReportsController,
    handler: ReportsController.prototype.getEditLogs,
  },
  {
    route: 'GET /admin/config-logs',
    controller: AdminController,
    handler: AdminController.prototype.getConfigChangeLogs,
  },
];

describe.each(historyEndpoints)('$route history access', ({ controller, handler }) => {
  const guard = new RolesGuard(new Reflector());

  function contextFor(role: UserRole) {
    return new ExecutionContextHost([{ user: { id: 1, role } }], controller, handler);
  }

  it('allows ADMIN to read history', () => {
    expect(guard.canActivate(contextFor(UserRole.ADMIN))).toBe(true);
  });

  it.each([UserRole.COO, UserRole.CITY_LEADER, UserRole.LEADER])(
    'rejects %s with HTTP 403',
    (role) => {
      let failure: unknown;
      try {
        guard.canActivate(contextFor(role));
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(ForbiddenException);
      expect((failure as ForbiddenException).getStatus()).toBe(403);
    },
  );
});
