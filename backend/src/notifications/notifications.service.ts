import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isPendingTriggerSuppressed, triggerLeaderInclude } from '../ipv-triggers/trigger-visibility';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async visibleWhere(userId: number) {
    const linked = await this.prisma.notification.findMany({
      where: { userId, ipvStatusId: { not: null } }, select: { ipvStatusId: true }, distinct: ['ipvStatusId'],
    });
    const ids = linked.flatMap(n => n.ipvStatusId === null ? [] : [n.ipvStatusId]);
    if (!ids.length) return { userId };
    const pending = await this.prisma.iPVStatus.findMany({
      where: { id: { in: ids }, status: 'NOT_STARTED' }, include: { coffeeShop: { include: triggerLeaderInclude } },
    });
    const now = new Date();
    const configs = pending.length ? await this.prisma.triggerConfig.findMany() : [];
    const hidden = pending.filter(s => isPendingTriggerSuppressed(s.coffeeShop, now, configs.find(c => c.code === s.triggerCode))).map(s => s.id);
    return hidden.length ? { userId, OR: [{ ipvStatusId: null }, { ipvStatusId: { notIn: hidden } }] } : { userId };
  }

  async getNotifications(userId: number) {
    return this.prisma.notification.findMany({
      where: await this.visibleWhere(userId),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(userId: number) {
    return this.prisma.notification.count({
      where: { ...await this.visibleWhere(userId), isRead: false },
    });
  }

  async markAsRead(id: number, userId: number) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId) throw new NotFoundException('Notification not found');
    if (notification.ipvStatusId && await this.prisma.iPVStatus.findFirst({ where: { id: notification.ipvStatusId, status: 'NOT_STARTED' } })) throw new BadRequestException('Уведомление активно до начала ИПВ');

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false, ipvStatusId: null },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async createNotification(data: { userId: number; title: string; message: string }) {
    return this.prisma.notification.create({
      data,
    });
  }
}
