import { AccessService } from '../common/access.service';
import { GetUser } from '../common/decorators/get-user.decorator';
import { Controller, Get, Param, Post, Body, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import { CoffeeShopsService } from './coffee-shops.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';

@ApiTags('coffee-shops')
@ApiBearerAuth()
@Controller('coffee-shops')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoffeeShopsController {
  constructor(private readonly coffeeShopsService: CoffeeShopsService, private readonly access: AccessService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.COO, UserRole.CITY_LEADER, UserRole.LEADER, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get all coffee shops' })
  @ApiQuery({ name: 'cityId', required: false })
  findAll(@GetUser() user: any, @Query('cityId') cityId?: string) {
    return this.coffeeShopsService.findAll(cityId ? parseInt(cityId) : undefined, this.access.shopWhere(user));
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.COO, UserRole.CITY_LEADER, UserRole.LEADER, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get coffee shop by ID' })
  async findOne(@Param('id') id: string, @GetUser() user: any) {
    await this.access.requireShop(user, Number(id));
    return this.coffeeShopsService.findOne(parseInt(id));
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Create coffee shop' })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string' }, cityId: { type: 'number' }, categoryId: { type: 'number' } } } })
  create(@Body() data: { name: string; cityId: number; categoryId?: number }, @GetUser() user: any) {
    return this.coffeeShopsService.create(data, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Update coffee shop' })
  update(@Param('id') id: string, @Body() data: { name?: string; isActive?: boolean; categoryId?: number }, @GetUser() user: any) {
    return this.coffeeShopsService.update(parseInt(id), data, user.id);
  }
}
