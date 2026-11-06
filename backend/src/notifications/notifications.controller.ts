import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { UserRole } from '../common/enums/user-role.enum';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get current user notifications' })
  getNotifications(@GetUser() user: any) {
    return this.notificationsService.getNotifications(user.sub);
  }

  @Get('unread-count')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get unread notifications count' })
  getUnreadCount(@GetUser() user: any) {
    return this.notificationsService.getUnreadCount(user.sub);
  }

  @Patch(':id/read')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark notification as read' })
  markAsRead(@Param('id') id: string, @GetUser() user: any) {
    return this.notificationsService.markAsRead(parseInt(id), user.sub);
  }

  @Patch('read-all')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@GetUser() user: any) {
    return this.notificationsService.markAllAsRead(user.sub);
  }
}
