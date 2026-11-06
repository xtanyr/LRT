import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { GetUser } from '../common/decorators/get-user.decorator';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('leader')
  @Roles(UserRole.LEADER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get leader dashboard' })
  getLeaderDashboard(@GetUser() user: any) {
    return this.dashboardService.getLeaderDashboard(user);
  }

  @Get('city-leader')
  @Roles(UserRole.CITY_LEADER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get city leader dashboard' })
  getCityLeaderDashboard(@GetUser() user: any) {
    return this.dashboardService.getCityLeaderDashboard(user);
  }

  @Get('coo')
  @Roles(UserRole.COO, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get COO dashboard' })
  getCooDashboard(@GetUser() user: any) {
    return this.dashboardService.getCooDashboard(user);
  }

  @Get('city/:cityId/summary')
  @Roles(UserRole.COO, UserRole.ADMIN, UserRole.CITY_LEADER, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get city summary' })
  getCitySummary(@Param('cityId') cityId: string, @GetUser() user: any) {
    return this.dashboardService.getCitySummary(Number(cityId), user);
  }
}
