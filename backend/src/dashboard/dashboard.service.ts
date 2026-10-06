import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, Actor } from '../common/access.service';
import { ReportsService } from '../reports/reports.service';
import { isPendingTriggerSuppressed, triggerLeaderInclude } from '../ipv-triggers/trigger-visibility';

@Injectable()
export class DashboardService {
 constructor(private readonly prisma: PrismaService, private readonly access: AccessService, private readonly reports: ReportsService) {}
 async getLeaderDashboard(user: Actor) {
  return this.getCityLeaderDashboard(user);
 }
 async getCityLeaderDashboard(user: Actor) {
  const shops = await this.prisma.coffeeShop.findMany({where: {AND:[this.access.shopWhere(user)],isActive:true},include:{city:true,...triggerLeaderInclude}});
  const coffeeShops = shops.map(({assignments,...shop})=>shop);
  const reports = await this.reports.getReportsByUser(user);
  const statuses = await this.prisma.iPVStatus.findMany({where:{coffeeShopId:{in:coffeeShops.map(s=>s.id)}}});
  const now = new Date();
  const configs = statuses.some(status=>status.status==='NOT_STARTED') ? await this.prisma.triggerConfig.findMany() : [];
  const ipvStatuses = statuses.filter(status=>status.status!=='NOT_STARTED'||!isPendingTriggerSuppressed(shops.find(shop=>shop.id===status.coffeeShopId)!,now,configs.find(config=>config.code===status.triggerCode)));
  return {coffeeShops,reports,ipvStatuses};
 }
 async getCooDashboard(user: Actor) {
  const data = await this.getCityLeaderDashboard(user);
  const cities = await this.prisma.city.findMany({where:{isActive:true},include:{coffeeShops:{where:{isActive:true}}}});
  return {...data,cities};
 }
 async getCitySummary(cityId: number,user: Actor) {
  this.access.requireCity(user,cityId);
  const data = await this.getCityLeaderDashboard(user);
  return {cityId,coffeeShops:data.coffeeShops.filter(s=>s.cityId===cityId),reports:data.reports.filter(r=>r.coffeeShop.cityId===cityId)};
 }
}
