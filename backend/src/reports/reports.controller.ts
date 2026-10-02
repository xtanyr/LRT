import { Controller, Get, Param, Post, Body, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { GetUser } from '../common/decorators/get-user.decorator';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('editing-policy')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get report editing policy for the current environment' })
  getEditingPolicy() {
    return this.reportsService.getEditingPolicy();
  }

  @Get('my')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get reports for current user' })
  getMyReports(@GetUser() user: any) {
    return this.reportsService.getReportsByUser(user);
  }

  @Get('coffee-shop/:coffeeShopId/:year/:month')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get report by coffee shop, year, and month' })
  getReport(
    @Param('coffeeShopId') coffeeShopId: string,
    @Param('year') year: string,
    @Param('month') month: string, @GetUser() user: any,
  ) {
    return this.reportsService.getReports(parseInt(coffeeShopId), parseInt(year), parseInt(month), user);
  }

  @Get(':id')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get report by ID' })
  getOne(@Param('id') id: string, @GetUser() user: any) {
    return this.reportsService.getReportById(parseInt(id), user);
  }

  @Post('draft')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create or update draft report' })
  @ApiBody({ schema: { type: 'object', properties: { coffeeShopId: { type: 'number' }, year: { type: 'number' }, month: { type: 'number' }, revenue: { type: 'number' }, drinksCount: { type: 'number' } } } })
  createDraft(@GetUser() user: any, @Body() body: any) {
    return this.reportsService.createOrUpdateDraft(body, user);
  }

  @Post(':id/submit')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Submit report' })
  submitReport(@Param('id') id: string, @GetUser() user: any) {
    return this.reportsService.submitReport(parseInt(id), user);
  }

  @Patch(':id/metric-values/:metricId')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update metric value in report' })
  updateMetricValue(
    @Param('id') id: string,
    @Param('metricId') metricId: string,
    @Body() data: { absoluteValue?: number; computedPercent?: number }, @GetUser() user: any,
  ) {
    return this.reportsService.updateMetricValue(parseInt(id), parseInt(metricId), data, user);
  }

  @Patch(':id/analysis/:questionKey')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update analysis in report' })
  updateAnalysis(
    @Param('id') id: string,
    @Param('questionKey') questionKey: string,
    @Body() data: { content: string }, @GetUser() user: any,
  ) {
    return this.reportsService.updateAnalysis(parseInt(id), questionKey, data.content, user);
  }

  @Get(':id/edit-logs')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get edit logs for report' })
  getEditLogs(@Param('id') id: string, @GetUser() user: any) {
    return this.reportsService.getEditLogs(parseInt(id), user);
  }
}
