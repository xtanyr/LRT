import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole, isReadOnlyRole } from '../enums/user-role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Роли «Просмотр» и «Лидер-семпай» имеют доступ только на чтение: любые изменяющие запросы запрещены независимо от списка ролей.
    const request = context.switchToHttp().getRequest();
    if (isReadOnlyRole(request.user?.role) && !['GET', 'HEAD', 'OPTIONS'].includes(String(request.method).toUpperCase())) {
      throw new ForbiddenException('Эта роль доступна только для просмотра');
    }
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      throw new ForbiddenException('Access denied');
    }
    const hasRole = requiredRoles.some((role) => user.role === role);
    if (!hasRole) {
      throw new ForbiddenException('Access denied');
    }
    return true;
  }
}
