import { AccessService } from '../common/access.service';
import { GetUser } from '../common/decorators/get-user.decorator';
import { Controller, Get, Param, Post, Body, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { CitiesService } from './cities.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';

@ApiTags('cities')
@ApiBearerAuth()
@Controller('cities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CitiesController {
  constructor(private readonly citiesService: CitiesService, private readonly access: AccessService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.COO, UserRole.CITY_LEADER, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get all cities' })
  findAll(@GetUser() user: any, @Query('includeInactiveShops') includeInactiveShops?: string) {
    const global = this.access.global(user);
    return this.citiesService.findAll(
      global ? undefined : (user.cityAssignments || []).map((a: any) => a.cityId),
      global && includeInactiveShops === 'true',
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.COO, UserRole.CITY_LEADER, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get city by ID' })
  findOne(@Param('id') id: string, @GetUser() user: any) {
    this.access.requireCity(user, Number(id));
    return this.citiesService.findOne(parseInt(id));
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Create city' })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string' } } } })
  create(@Body() data: { name: string }, @GetUser() user: any) {
    return this.citiesService.create(data, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.COO)
  @ApiOperation({ summary: 'Update city' })
  update(@Param('id') id: string, @Body() data: { name?: string; isActive?: boolean }, @GetUser() user: any) {
    return this.citiesService.update(parseInt(id), data, user.id);
  }
}
