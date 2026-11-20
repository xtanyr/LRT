import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ScoringEngineService } from './scoring-engine.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { AccessService } from '../common/access.service';
import { GetUser } from '../common/decorators/get-user.decorator';

@ApiTags('scoring')
@ApiBearerAuth()
@Controller('scoring')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScoringController {
  constructor(
    private readonly scoringEngineService: ScoringEngineService,
    private readonly accessService: AccessService,
  ) {}

  @Get('report/:coffeeShopId/:year/:month')
  @Roles(UserRole.LEADER, UserRole.CITY_LEADER, UserRole.COO, UserRole.ADMIN, UserRole.SENPAI)
  @ApiOperation({ summary: 'Calculate rating for a report' })
  async calculateRating(
    @Param('coffeeShopId', ParseIntPipe) coffeeShopId: number,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @GetUser() user: any,
  ) {
    await this.accessService.requireShop(user, coffeeShopId);
    return this.scoringEngineService.calculateRating(coffeeShopId, year, month);
  }
}
