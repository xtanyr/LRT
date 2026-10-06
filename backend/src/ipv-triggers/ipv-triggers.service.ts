import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, Actor } from '../common/access.service';
import { meaningfulText, numberValue, positiveId } from '../common/validation';
import { previousReportingPeriod } from '../common/report-period';
import { TriggerMonitorService } from './trigger-monitor.service';
import { evaluateShopTriggers, getCurrentLeaders } from './trigger-evaluation';
import { currentAssignmentWhere, isPendingTriggerSuppressed, triggerLeaderInclude } from './trigger-visibility';

@Injectable()
export class IpvTriggersService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService, private readonly monitor: TriggerMonitorService) {}

  getTriggerConfigs() { return this.prisma.triggerConfig.findMany({ orderBy: { code: 'asc' } }); }

  async updateTriggerConfig(rawId: number, data: any, user: Actor) {
    const id = positiveId(rawId);
    const fields = ['thresholdRating', 'monthsCount', 'minMonthsOnPosition', 'minMonthsSinceApproval', 'isActive'];
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.keys(data).length || Object.keys(data).some(k => !fields.includes(k))) throw new BadRequestException('Укажите допустимые поля конфигурации');
    const update: any = {};
    for (const key of Object.keys(data)) {
      if (key === 'isActive') {
        if (typeof data[key] !== 'boolean') throw new BadRequestException('Ожидается логическое значение');
        update[key] = data[key];
      } else {
        const value = numberValue(data[key], key)!;
        if (value < 0 || value > 100 || (key !== 'thresholdRating' && (!Number.isInteger(value) || value > 36 || (key === 'monthsCount' && value === 0)))) throw new BadRequestException('Недопустимый параметр триггера');
        update[key] = value;
      }
    }
    return this.prisma.$transaction(async tx => {
      const old = await tx.triggerConfig.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Триггер не найден');
      const result = await tx.triggerConfig.update({ where: { id }, data: update });
      await tx.configChangeLog.create({ data: { changedById: user.id!, fieldChanged: 'trigger:' + id, oldValue: JSON.stringify(old), newValue: JSON.stringify(result) } });
      return result;
    });
  }

  private async scopedShopWhere(user: Actor, rawShopId?: unknown) {
    const scoped = this.access.shopWhere(user);
    if (rawShopId === undefined) return scoped;
    const id = positiveId(rawShopId);
    await this.access.requireShop(user, id);
    return { AND: [scoped, { id }] };
  }

  async getIpvStatuses(user: Actor, rawShopId?: unknown) {
    const shopWhere = this.access.shopWhere(user);
    const coffeeShopId = rawShopId === undefined ? undefined : positiveId(rawShopId);
    if (coffeeShopId !== undefined) await this.access.requireShop(user, coffeeShopId);
    const now = new Date();
    const rows = await this.prisma.iPVStatus.findMany({
      where: { coffeeShop: shopWhere, ...(coffeeShopId === undefined ? {} : { coffeeShopId }) },
      include: { coffeeShop: { include: { city: true, ...triggerLeaderInclude } } }, orderBy: { triggeredAt: 'desc' },
    });
    const configs = rows.some(r => r.status === 'NOT_STARTED') ? await this.getTriggerConfigs() : [];
    const visible = rows.filter(r => r.status !== 'NOT_STARTED' || !isPendingTriggerSuppressed(r.coffeeShop, now, configs.find(c => c.code === r.triggerCode)));
    const metricIds = [...new Set(visible.flatMap(r => r.metricId == null ? [] : [r.metricId]))];
    const fields = visible.filter(r => r.status === 'COMPLETED').map(r => 'ipv:' + r.id);
    const [metrics, logs] = await Promise.all([
      metricIds.length ? this.prisma.metric.findMany({ where: { id: { in: metricIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      fields.length ? this.prisma.configChangeLog.findMany({ where: { fieldChanged: { in: fields } }, orderBy: [{ changedAt: 'desc' }, { id: 'desc' }], select: { fieldChanged: true, newValue: true } }) : Promise.resolve([]),
    ]);
    const names = new Map(metrics.map(m => [m.id, m.name]));
    const outcomes = new Map<string, string>();
    for (const log of logs) {
      if (outcomes.has(log.fieldChanged)) continue;
      try {
        const value = JSON.parse(log.newValue ?? 'null');
        if (value?.status === 'COMPLETED' && typeof value.closeReason === 'string') outcomes.set(log.fieldChanged, value.closeReason);
      } catch { /* Older audit entries may contain a plain status. */ }
    }
    return visible.map(r => ({
      ...r, rule: r.triggerCode, severity: 'critical', metricName: r.metricId == null ? null : names.get(r.metricId) ?? null,
      closeReason: r.status === 'COMPLETED' ? outcomes.get('ipv:' + r.id) ?? null : null,
      daysOverdue: r.status === 'NOT_STARTED' ? Math.max(0, Math.floor((now.getTime() - r.triggeredAt.getTime()) / 86400000) - 14) : 0,
    }));
  }

  async getDiagnostics(user: Actor, rawShopId?: unknown) {
    const where = await this.scopedShopWhere(user, rawShopId);
    const now = new Date();
    const end = previousReportingPeriod(now);
    const [shops, configs] = await Promise.all([
      this.prisma.coffeeShop.findMany({ where: { AND: [where], isActive: true }, include: { city: true, ...triggerLeaderInclude } }), this.getTriggerConfigs(),
    ]);
    return Promise.all(shops.map(async shop => {
      const reports = await this.prisma.monthlyReport.findMany({ where: { coffeeShopId: shop.id, status: 'SUBMITTED', OR: [{ year: { lt: end.year } }, { year: end.year, month: { lte: end.month } }] }, orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 36 });
      const evaluation = evaluateShopTriggers(shop.assignments, reports, configs, now);
      return {
        coffeeShopId: shop.id, coffeeShop: { id: shop.id, name: shop.name, city: shop.city },
        leaders: evaluation.leaders.map(a => ({
          id: a.user.id, name: a.user.name, approvedAt: a.user.approvedAt, assignedFrom: a.assignedFrom,
          exemptions: a.user.exemptions.map(e => ({ ...e, canClear: this.access.global(user) || e.setById === user.id })),
        })), checks: evaluation.checks,
      };
    }));
  }

  async evaluateNow(user: Actor, rawShopId?: unknown) {
    const where = await this.scopedShopWhere(user, rawShopId);
    const shops = await this.prisma.coffeeShop.findMany({ where: { AND: [where], isActive: true }, select: { id: true } });
    const evaluatedAt = new Date();
    await this.monitor.evaluate(evaluatedAt, shops.map(s => s.id));
    return { evaluatedAt };
  }

  async updateIpvStatus(rawId: number, data: any, user: Actor) {
    const id = positiveId(rawId);
    if (!['IN_PROGRESS', 'COMPLETED'].includes(data?.status)) throw new BadRequestException('Некорректный статус');
    const found = await this.prisma.iPVStatus.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('ИПВ не найден');
    await this.access.requireShop(user, found.coffeeShopId);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${found.coffeeShopId}::bigint)`;
      const old = await tx.iPVStatus.findUnique({ where: { id }, include: { coffeeShop: { include: triggerLeaderInclude } } });
      if (!old) throw new NotFoundException('ИПВ не найден');
      if (old.status === 'COMPLETED' || old.status === data.status || (old.status === 'NOT_STARTED' && data.status === 'COMPLETED')) throw new BadRequestException('Недопустимый переход статуса ИПВ');
      if (old.status === 'NOT_STARTED') {
        const config = await tx.triggerConfig.findUnique({ where: { code: old.triggerCode } });
        if (isPendingTriggerSuppressed(old.coffeeShop, new Date(), config ?? undefined)) throw new BadRequestException('Правило отключено или нет действующего лидера с нужным стажем без ручного исключения');
      }
      if (data.status === 'COMPLETED' && (!meaningfulText(data.closeReason) || data.closeReason.length > 2000)) throw new BadRequestException('Укажите итог ИПВ (до 2000 символов)');
      const changedAt = new Date();
      // Simultaneous rules describe reasons for one IPV process on the shop.
      const related = await tx.iPVStatus.findMany({ where: { coffeeShopId: old.coffeeShopId, status: old.status } });
      const group = [old, ...related.filter(row => row.id !== id)].map(row => ({ id: row.id, status: row.status }));
      let result;
      for (const row of group) {
        const updated = await tx.iPVStatus.update({ where: { id: row.id }, data: { status: data.status, statusChangedBy: user.id, statusChangedAt: changedAt }, include: { coffeeShop: { include: { city: true } } } });
        if (row.id === id) result = updated;
        await tx.configChangeLog.create({ data: { changedById: user.id!, fieldChanged: 'ipv:' + row.id, oldValue: row.status, newValue: JSON.stringify({ status: data.status, ...(data.status === 'COMPLETED' ? { closeReason: data.closeReason.trim() } : {}) }) } });
      }
      await tx.notification.updateMany({ where: { ipvStatusId: { in: group.map(row => row.id) } }, data: { isRead: true, readAt: changedAt } });
      return result;
    });
  }

  private async requireLeader(user: Actor, userId: number) {
    const leader = await this.prisma.user.findUnique({ where: { id: userId }, include: { coffeeShopAssignments: { include: { coffeeShop: true } }, exemptions: { where: { isActive: true } } } });
    if (!leader || leader.role !== 'LEADER') throw new NotFoundException('Лидер не найден');
    if (this.access.global(user)) return leader;
    const current = getCurrentLeaders(leader.coffeeShopAssignments.map(a => ({ ...a, user: leader })), new Date());
    if (!current.length) throw new BadRequestException('У лидера нет действующего назначения на кофейню');
    for (const assignment of current) await this.access.requireShop(user, assignment.coffeeShopId);
    return leader;
  }

  async createExemption(data: any, user: Actor) {
    const userId = positiveId(data?.userId);
    await this.requireLeader(user, userId);
    if (!meaningfulText(data?.reason) || data.reason.length > 1000) throw new BadRequestException('Укажите причину исключения (до 1000 символов)');
    return this.prisma.triggerExemption.create({ data: { userId, reason: data.reason.trim(), setById: user.id! }, include: { user: { select: { id: true, name: true } } } });
  }

  async clearExemption(rawId: number, user: Actor) {
    const id = positiveId(rawId);
    const exemption = await this.prisma.triggerExemption.findUnique({ where: { id } });
    if (!exemption) throw new NotFoundException('Исключение не найдено');
    if (!this.access.global(user) && exemption.setById !== user.id) throw new ForbiddenException('Снять исключение может автор, администратор или COO');
    return this.prisma.triggerExemption.update({ where: { id }, data: { isActive: false, clearedById: user.id, clearedAt: new Date() } });
  }

  async getExemptions(user: Actor) {
    const where: any = { isActive: true };
    if (!this.access.global(user)) where.OR = [
      { setById: user.id },
      { user: { coffeeShopAssignments: { some: { ...currentAssignmentWhere(), coffeeShop: this.access.shopWhere(user) } } } },
    ];
    const rows = await this.prisma.triggerExemption.findMany({ where, include: { user: { select: { id: true, name: true } } } });
    return rows.map(r => ({ ...r, canClear: this.access.global(user) || r.setById === user.id }));
  }
}
