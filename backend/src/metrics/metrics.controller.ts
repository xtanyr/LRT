import { Controller, Get, Param, Post, Body, Patch, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { GetUser, JwtPayload } from '../common/decorators/get-user.decorator';
import { CreateMetricDto } from './dto/create-metric.dto';
import { UpdateMetricDto } from './dto/update-metric.dto';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.COO, UserRole.LEADER, UserRole.CITY_LEADER, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get all metrics' })
  findAll() {
    return this.metricsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.COO, UserRole.LEADER, UserRole.CITY_LEADER, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get metric by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.metricsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Create metric' })
  create(@Body() data: CreateMetricDto, @GetUser() user: JwtPayload) {
    return this.metricsService.create(data, user.sub);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Update metric' })
  update(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateMetricDto, @GetUser() user: JwtPayload) {
    return this.metricsService.update(id, data, user.sub);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Soft delete metric' })
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: JwtPayload) {
    return this.metricsService.remove(id, user.sub);
  }

  @Patch(':id/restore')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Restore archived metric' })
  restore(@Param('id', ParseIntPipe) id: number, @GetUser() user: JwtPayload) {
    return this.metricsService.restore(id, user.sub);
  }
}
