import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { latestClosedPeriod } from '../report-period';
import { calculateScore } from '../../scoring/rating-calculator';

// Автозакрытие действует с отчётного периода октябрь 2026 (закрывается 11.11.2026).
// Более ранние месяцы закрывались по прежним правилам и задним числом не отправляются.
const AUTO_CLOSE_FROM = 2026 * 12 + 10;

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Автозакрытие отчётного месяца в 12:00 МСК 11-го числа: неотправленные отчёты отправляются «как есть»
   * (незаполненные метрики дают 0 баллов) и блокируются; для кофеен с лидером, у которых отчёта нет,
   * создаётся пустой отчёт с рейтингом 0. Задача идемпотентна и запускается каждые 15 минут,
   * чтобы пропущенный из-за перезапуска сервера момент закрытия был выполнен позже.
   * Затрагивается только последний закрытый месяц — более ранние периоды не изменяются.
   */
  @Cron('0 */15 * * * *', { name: 'close-reports-job', timeZone: 'Europe/Moscow' })
  async handleCloseReports(now = new Date()) {
    const { year, month } = latestClosedPeriod(now);
    if (year * 12 + month < AUTO_CLOSE_FROM) return;
    const metrics = await this.prisma.metric.findMany({ where: { isActive: true } });
    const closedAt = now.toISOString();
    const snapshotFor = (report: any) => ({ ...calculateScore(metrics, report), autoClosed: true, autoClosedAt: closedAt });

    const open = await this.prisma.monthlyReport.findMany({ where: { year, month, status: { not: 'SUBMITTED' } }, include: { metricValues: true } });
    for (const report of open) {
      await this.prisma.monthlyReport.update({
        where: { id: report.id },
        data: { status: 'SUBMITTED', isLocked: true, submittedAt: now, ratingSnapshot: snapshotFor(report) as any },
      });
    }
    await this.prisma.monthlyReport.updateMany({ where: { year, month, status: 'SUBMITTED', isLocked: false }, data: { isLocked: true } });

    const periodStart = new Date(Date.UTC(year, month - 1, 1, -3));
    const periodEnd = new Date(Date.UTC(year, month, 1, -3));
    const shops = await this.prisma.coffeeShop.findMany({
      where: {
        isActive: true,
        reports: { none: { year, month } },
        assignments: { some: { assignedFrom: { lte: periodEnd }, OR: [{ assignedUntil: null }, { assignedUntil: { gte: periodStart } }] } },
      },
      select: { id: true },
    });
    for (const shop of shops) {
      try {
        await this.prisma.monthlyReport.create({
          data: {
            coffeeShopId: shop.id, year, month, revenue: 0, status: 'SUBMITTED', isLocked: true, submittedAt: now,
            ratingSnapshot: snapshotFor({ revenue: 0, drinksCount: null, metricValues: [] }) as any,
          },
        });
      } catch (error) {
        this.logger.warn(`Не удалось создать пустой отчёт ${year}-${month} для кофейни ${shop.id}: ${(error as Error).message}`);
      }
    }
    if (open.length || shops.length) this.logger.log(`Закрыт период ${year}-${String(month).padStart(2, '0')}: отправлено ${open.length}, создано пустых ${shops.length}`);
  }
}
