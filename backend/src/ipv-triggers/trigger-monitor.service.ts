import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TriggerCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { previousReportingPeriod } from '../common/report-period';
import { evaluateShopTriggers } from './trigger-evaluation';

@Injectable()
export class TriggerMonitorService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}
  async onModuleInit() {
    for (const config of [
      { code: TriggerCode.T1, thresholdRating: 60, monthsCount: 3 },
      { code: TriggerCode.T2, thresholdRating: 80, monthsCount: 12 },
      { code: TriggerCode.T3, thresholdRating: 0, monthsCount: 3 },
    ]) await this.prisma.triggerConfig.upsert({ where: { code: config.code }, create: { ...config, minMonthsOnPosition: 6, minMonthsSinceApproval: 6, isActive: true }, update: {} });
  }
  @Cron('0 */15 * * * *', { timeZone: 'Europe/Moscow' })
  async evaluate(now = new Date(), coffeeShopIds?: number[]) {
    const end = previousReportingPeriod(now);
    const shops = await this.prisma.coffeeShop.findMany({where:{isActive:true,...(coffeeShopIds ? {id:{in:coffeeShopIds}} : {})},include:{assignments:{include:{user:{include:{exemptions:{where:{isActive:true}}}}}},city:{include:{cityAssignments:{where:{user:{role:'CITY_LEADER'},assignedFrom:{lte:now}}}}}}});
    const configs = await this.prisma.triggerConfig.findMany();
    for (const shop of shops) {
      const reports = await this.prisma.monthlyReport.findMany({where:{coffeeShopId:shop.id,status:'SUBMITTED',OR:[{year:{lt:end.year}},{year:end.year,month:{lte:end.month}}]},orderBy:[{year:'desc'},{month:'desc'}],take:36});
      const { checks } = evaluateShopTriggers(shop.assignments, reports, configs, now);
      for (const check of checks) {
        if (!check.matched) continue;
        const triggerCode = check.code as TriggerCode;
        await this.prisma.$transaction(async tx => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${shop.id}::bigint)`;
          if (await tx.iPVStatus.findFirst({where:{coffeeShopId:shop.id,OR:[{status:'IN_PROGRESS'},{status:'NOT_STARTED',triggerCode}]}})) return;
          const key = `ipv:${shop.id}:${triggerCode}:${check.windowEnd.year}:${check.windowEnd.month}`;
          if (await tx.systemSetting.findUnique({where:{key}})) return;
          const status = await tx.iPVStatus.upsert({where:{coffeeShopId_triggerCode:{coffeeShopId:shop.id,triggerCode}},create:{coffeeShopId:shop.id,triggerCode,metricId:check.metricId,triggeredAt:now},update:{status:'NOT_STARTED',metricId:check.metricId,triggeredAt:now,statusChangedAt:null,statusChangedBy:null}});
          await tx.systemSetting.create({data:{key,value:String(status.id)}});
          for (const userId of new Set(shop.city.cityAssignments.map(assignment => assignment.userId))) await tx.notification.create({data:{userId,ipvStatusId:status.id,title:'Требует внимания',message:`${shop.name} — сработал триггер ${triggerCode}`}});
        });
      }
    }
  }
}
