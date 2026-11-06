import { Controller, Get, Param, Post, Body, Patch, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { UserRole } from '../common/enums/user-role.enum';

@ApiTags('comments')
@ApiBearerAuth()
@Controller('comments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('coffee-shop/:coffeeShopId')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get comments for coffee shop' })
  getComments(@Param('coffeeShopId') coffeeShopId: string, @GetUser() user: any) {
    return this.commentsService.getComments(Number(coffeeShopId), user);
  }

  @Post()
  @Roles(UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create comment' })
  createComment(@GetUser() user: any, @Body() data: { coffeeShopId: number; reportId?: number; text: string }) {
    return this.commentsService.createComment(data, user);
  }

  @Patch(':id')
  @Roles(UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update comment' })
  updateComment(@Param('id') id: string, @GetUser() user: any, @Body() data: { text: string }) {
    return this.commentsService.updateComment(Number(id), data.text, user);
  }

  @Delete(':id')
  @Roles(UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete comment' })
  deleteComment(@Param('id') id: string, @GetUser() user: any) {
    return this.commentsService.deleteComment(Number(id), user);
  }
}
