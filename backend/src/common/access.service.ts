import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentAssignmentWhere } from '../ipv-triggers/trigger-visibility';

export interface Actor {
  id?: number;
  role: string;
  coffeeShopAssignments?: { coffeeShopId: number }[];
  cityAssignments?: { cityId: number }[];
}

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  global(user: Actor) {
    if (!user?.id) throw new ForbiddenException('Требуется авторизация');
    return user.role === 'ADMIN' || user.role === 'COO' || user.role === 'VIEWER';
  }

  /** Право изменять данные «глобально»: администратор и COO. Роли «Просмотр» (VIEWER) и «Лидер-семпай» (SENPAI) только просматривают. */
  canManage(user: Actor) {
    return user.role === 'ADMIN' || user.role === 'COO';
  }

  shopWhere(user: Actor): any {
    if (this.global(user)) return {};
    if (user.role === 'LEADER') return { id: { in: (user.coffeeShopAssignments || []).map(a => a.coffeeShopId) } };
    if (user.role === 'CITY_LEADER') return { cityId: { in: (user.cityAssignments || []).map(a => a.cityId) } };
    // Лидер-семпай: кофейни, за которыми сейчас закреплены его подчинённые лидеры.
    if (user.role === 'SENPAI') {
      return {
        assignments: {
          some: { ...currentAssignmentWhere(), user: { role: 'LEADER', supervisors: { some: { supervisorId: user.id } } } },
        },
      };
    }
    throw new ForbiddenException('Недостаточно прав');
  }

  async requireShop(user: Actor, id: number) {
    const global = this.global(user);
    if (!Number.isInteger(id) || id < 1) throw new NotFoundException('Кофейня не найдена');
    const shop = await this.prisma.coffeeShop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Кофейня не найдена');
    let allowed = global ||
      (user.role === 'LEADER' && user.coffeeShopAssignments?.some(a => a.coffeeShopId === id)) ||
      (user.role === 'CITY_LEADER' && user.cityAssignments?.some(a => a.cityId === shop.cityId));
    if (!allowed && user.role === 'SENPAI') {
      allowed = (await this.prisma.coffeeShop.count({ where: { id, ...this.shopWhere(user) } })) > 0;
    }
    if (!allowed) throw new ForbiddenException('Нет доступа к этой кофейне');
    return shop;
  }

  async requireReport(user: Actor, id: number) {
    const report = await this.prisma.monthlyReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Отчёт не найден');
    await this.requireShop(user, report.coffeeShopId);
    return report;
  }

  async requireCity(user: Actor, id: number): Promise<void> {
    if (this.global(user)) return;
    if (user.role === 'CITY_LEADER' && user.cityAssignments?.some(a => a.cityId === id)) return;
    if (user.role === 'SENPAI' && (await this.prisma.coffeeShop.count({ where: { cityId: id, ...this.shopWhere(user) } })) > 0) return;
    throw new ForbiddenException('Нет доступа к этому городу');
  }
}
