import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { Roles } from '../authz/roles.decorator';
import { PlatformAccessGuard } from '../authz/platform-access.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('staff-dashboard')
@ApiBearerAuth('staff')
@Controller('staff/dashboard')
@UseGuards(JwtAuthGuard, PlatformAccessGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Roles(Role.FOCAL_POINT, Role.DEVELOPER, Role.ADMIN)
  @ApiOperation({ summary: 'Scoped dashboard counts and trend.' })
  summary(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.dashboard.summary(staff);
  }
}
