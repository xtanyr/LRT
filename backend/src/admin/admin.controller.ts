import { Controller, Get, Param, Post, Body, Patch, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CreateAnalysisQuestionDto } from './dto/create-analysis-question.dto';
import { GetUser } from '../common/decorators/get-user.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('rating-color-config')
  @Roles(UserRole.ADMIN, UserRole.COO, UserRole.CITY_LEADER, UserRole.LEADER)
  @ApiOperation({ summary: 'Get rating color config' })
  getRatingColorConfig() {
    return this.adminService.getRatingColorConfig();
  }

  @Patch('rating-color-config')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Update rating color config' })
  updateRatingColorConfig(@Body() data: { greenThreshold: number; redThreshold: number }, @GetUser() user: any) {
    return this.adminService.updateRatingColorConfig(data, user.id);
  }

  @Get('config-logs')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get config change logs' })
  getConfigChangeLogs() {
    return this.adminService.getConfigChangeLogs();
  }

  @Get('analysis-questions')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get analysis questions' })
  getAnalysisQuestions() {
    return this.adminService.getAnalysisQuestions();
  }

  @Post('analysis-questions')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Create analysis question' })
  createAnalysisQuestion(@Body() data: CreateAnalysisQuestionDto) {
    return this.adminService.createAnalysisQuestion(data);
  }

  @Patch('analysis-questions/:id')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Update analysis question' })
  updateAnalysisQuestion(@Param('id') id: string, @Body() data: { label?: string; isActive?: boolean; displayOrder?: number }) {
    return this.adminService.updateAnalysisQuestion(parseInt(id), data);
  }

  @Delete('analysis-questions/:id')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Delete analysis question' })
  removeAnalysisQuestion(@Param('id') id: string) {
    return this.adminService.removeAnalysisQuestion(parseInt(id));
  }

  @Get('trigger-configs')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Get trigger configs' })
  getTriggerConfigs() {
    return this.adminService.getTriggerConfigs();
  }

  @Get('users')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Get all users' })
  getUsers() {
    return this.adminService.getUsers();
  }
}
