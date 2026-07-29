import {
  Controller, Get, Param, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { Roles } from '../authz/roles.decorator';
import { PlatformAccessGuard } from '../authz/platform-access.guard';
import { STAFF_READ_ROLES } from '../authz/role-sets';
import { DashboardService } from './dashboard.service';

@ApiTags('staff-dashboard')
@ApiBearerAuth('staff')
@Controller('staff/dashboard')
@UseGuards(JwtAuthGuard, PlatformAccessGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Roles(...STAFF_READ_ROLES)
  @ApiOperation({ summary: 'Scoped dashboard counts and trend.' })
  summary(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.dashboard.summary(staff);
  }
}

// Per-platform "tenant owner" report. This route carries a platformId (not an
// issue id), so the service does the read-role scope check — same shape as the
// labels/canned-response controllers. A watcher scoped to the platform is the
// canonical tenant-owner grant.
@ApiTags('staff-reporting')
@ApiBearerAuth('staff')
@Controller('staff/platforms/:platformId/report')
@UseGuards(JwtAuthGuard)
export class PlatformReportController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Single-platform support-health report (scoped, read-role).' })
  report(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
  ) {
    return this.dashboard.platformReport(staff, platformId);
  }
}
