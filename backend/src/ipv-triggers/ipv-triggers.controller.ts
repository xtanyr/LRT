import { Controller, Get, Param, Post, Body, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { IpvTriggersService } from './ipv-triggers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { UserRole } from '../common/enums/user-role.enum';

@ApiTags('ipv-triggers')
@ApiBearerAuth()
@Controller('ipv-triggers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IpvTriggersController {
  constructor(private readonly ipvTriggersService: IpvTriggersService) {}

  @Get('config')
  @Roles(UserRole.ADMIN, UserRole.COO, UserRole.CITY_LEADER)
  @ApiOperation({ summary: 'Get trigger configs' })
  getConfigs() {
    return this.ipvTriggersService.getTriggerConfigs();
  }

  @Patch('config/:id')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Update trigger config' })
  updateConfig(@Param('id') id: string, @Body() data: any, @GetUser() user: any) {
    return this.ipvTriggersService.updateTriggerConfig(Number(id), data, user);
  }

  @Get('statuses')
  @Roles(UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get IPV statuses' })
  getStatuses(@GetUser() user: any, @Query('coffeeShopId') coffeeShopId?: string) {
    return this.ipvTriggersService.getIpvStatuses(user, coffeeShopId);
  }

  @Get('diagnostics')
  @Roles(UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Explain current trigger evaluation' })
  getDiagnostics(@GetUser() user: any, @Query('coffeeShopId') coffeeShopId?: string) {
    return this.ipvTriggersService.getDiagnostics(user, coffeeShopId);
  }

  @Post('evaluate')
  @Roles(UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Evaluate triggers in accessible shops now' })
  evaluate(@GetUser() user: any, @Query('coffeeShopId') coffeeShopId?: string) {
    return this.ipvTriggersService.evaluateNow(user, coffeeShopId);
  }

  @Patch('status/:id')
  @Roles(UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update IPV status' })
  updateStatus(@Param('id') id: string, @Body() data: any, @GetUser() user: any) {
    return this.ipvTriggersService.updateIpvStatus(Number(id), data, user);
  }

  @Post('exemptions')
  @Roles(UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create exemption' })
  createExemption(@Body() data: any, @GetUser() user: any) {
    return this.ipvTriggersService.createExemption(data, user);
  }

  @Patch('exemptions/:id/clear')
  @Roles(UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Clear exemption' })
  clearExemption(@Param('id') id: string, @GetUser() user: any) {
    return this.ipvTriggersService.clearExemption(Number(id), user);
  }

  @Get('exemptions')
  @Roles(UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get exemptions' })
  getExemptions(@GetUser() user: any) {
    return this.ipvTriggersService.getExemptions(user);
  }
}
