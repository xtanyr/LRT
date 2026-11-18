import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { positiveId } from '../common/validation';
const select = {id:true,name:true,email:true,role:true,approvedAt:true,coffeeShopAssignments:{include:{coffeeShop:true}},cityAssignments:{include:{city:true}},supervisions:{select:{leaderId:true}}} as const;
@Injectable()
export class UsersAdminService {
 constructor(private readonly prisma: PrismaService) {}
 findOne(id:number) {return this.prisma.user.findUniqueOrThrow({where:{id},select});}
 async update(id:number, body:any, actorId:number) {
  if(!body||Object.keys(body).some(k=>!['role','approvedAt','cityIds','coffeeShopIds','assignmentFrom','assignmentUntil','leaderIds'].includes(k)))throw new BadRequestException('Неизвестное поле пользователя');
  if(body.role!==undefined&&!Object.values(UserRole).includes(body.role))throw new BadRequestException('Некорректная роль');
  for(const key of ['cityIds','coffeeShopIds','leaderIds'])if(body[key]!==undefined){if(!Array.isArray(body[key]))throw new BadRequestException('Ожидается список назначений');body[key]=[...new Set(body[key].map(positiveId))];}
  let approvedAt:Date|null|undefined;
  if(body.approvedAt!==undefined){approvedAt=body.approvedAt?new Date(body.approvedAt):null;if(approvedAt&&(!Number.isFinite(approvedAt.getTime())||approvedAt>new Date()))throw new BadRequestException('Некорректная дата утверждения');}
  return this.prisma.$transaction(async tx=>{
   const old=await tx.user.findUniqueOrThrow({where:{id},select});
   await tx.user.update({where:{id},data:{role:body.role,approvedAt}});
   if(body.cityIds!==undefined){
    if(await tx.city.count({where:{id:{in:body.cityIds}}})!==body.cityIds.length)throw new BadRequestException('Город не найден');
    await tx.userCityAssignment.deleteMany({where:{userId:id,cityId:{notIn:body.cityIds}}});
    for(const cityId of body.cityIds)await tx.userCityAssignment.upsert({where:{userId_cityId:{userId:id,cityId}},create:{userId:id,cityId},update:{}});
   }
   if(body.coffeeShopIds!==undefined){
    if(await tx.coffeeShop.count({where:{id:{in:body.coffeeShopIds}}})!==body.coffeeShopIds.length)throw new BadRequestException('Кофейня не найдена');
    const assignedFrom=body.assignmentFrom?new Date(body.assignmentFrom):new Date();
    const assignedUntil=body.assignmentUntil?new Date(body.assignmentUntil):null;
    if(!Number.isFinite(assignedFrom.getTime())||(assignedUntil&&!Number.isFinite(assignedUntil.getTime()))||(assignedUntil&&assignedUntil<assignedFrom))throw new BadRequestException('Некорректная дата назначения');
    await tx.userCoffeeShopAssignment.updateMany({where:{userId:id,assignedUntil:null,coffeeShopId:{notIn:body.coffeeShopIds}},data:{assignedUntil:assignedUntil??new Date()}});
    for(const coffeeShopId of body.coffeeShopIds){
     const active=await tx.userCoffeeShopAssignment.findFirst({where:{userId:id,coffeeShopId,assignedUntil:null}});
     if(active)await tx.userCoffeeShopAssignment.update({where:{id:active.id},data:{assignedFrom,assignedUntil}});
     else await tx.userCoffeeShopAssignment.create({data:{userId:id,coffeeShopId,assignedFrom,assignedUntil}});
    }
   }
   const effectiveRole=body.role??old.role;
   if(body.leaderIds!==undefined){
    if(effectiveRole!=='SENPAI')throw new BadRequestException('РџРѕРґС‡РёРЅС‘РЅРЅС‹С… Р»РёРґРµСЂРѕРІ РјРѕР¶РЅРѕ РЅР°Р·РЅР°С‡РёС‚СЊ С‚РѕР»СЊРєРѕ СЂРѕР»Рё SENPAI');
    if(body.leaderIds.includes(id))throw new BadRequestException('РќРµР»СЊР·СЏ РЅР°Р·РЅР°С‡РёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СЃРІРѕРёРј РїРѕРґС‡РёРЅС‘РЅРЅС‹Рј');
    if(await tx.user.count({where:{id:{in:body.leaderIds},role:'LEADER'}})!==body.leaderIds.length)throw new BadRequestException('РџРѕРґС‡РёРЅС‘РЅРЅС‹Рј РјРѕР¶РµС‚ Р±С‹С‚СЊ С‚РѕР»СЊРєРѕ Р»РёРґРµСЂ');
    await tx.userSupervision.deleteMany({where:{supervisorId:id,leaderId:{notIn:body.leaderIds}}});
    if(body.leaderIds.length)await tx.userSupervision.createMany({data:body.leaderIds.map((leaderId:number)=>({supervisorId:id,leaderId})),skipDuplicates:true});
   } else if(old.role==='SENPAI'&&effectiveRole!=='SENPAI'){
    await tx.userSupervision.deleteMany({where:{supervisorId:id}});
   }
   const result=await tx.user.findUniqueOrThrow({where:{id},select});
   await tx.configChangeLog.create({data:{changedById:actorId,fieldChanged:'user:'+id,oldValue:JSON.stringify(old),newValue:JSON.stringify(result)}});
   return result;
  });
 }
}
