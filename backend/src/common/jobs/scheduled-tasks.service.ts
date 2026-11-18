import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { latestClosedPeriod } from '../report-period';

@Injectable()
export class ScheduledTasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Отчёты отправляются только вручную: система сама ничего не отправляет и не создаёт отчёты за лидеров.
   * Задача лишь блокирует уже отправленные отчёты последнего закрытого месяца (09:00 МСК 10-го числа).
   * Неотправленный черновик после закрытия месяца остаётся черновиком, рейтинг по нему не считается.
   * Запускается каждые 15 минут, чтобы пропущенный из-за перезапуска сервера момент был выполнен позже.
   */
  @Cron('0 */15 * * * *', { name: 'close-reports-job', timeZone: 'Europe/Moscow' })
  async handleCloseReports(now = new Date()) {
    const { year, month } = latestClosedPeriod(now);
    await this.prisma.monthlyReport.updateMany({ where: { year, month, status: 'SUBMITTED', isLocked: false }, data: { isLocked: true } });
  }
}
