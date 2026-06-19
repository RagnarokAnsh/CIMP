import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { IssuesService } from './issues.service';

// Read-only, scope-aware platform list for any staff member (the admin platform
// endpoints under /admin are ADMIN-only). Powers the issue-list platform filter.
@ApiTags('staff-platforms')
@ApiBearerAuth('staff')
@Controller('staff/platforms')
@UseGuards(JwtAuthGuard)
export class StaffPlatformsController {
  constructor(private readonly issues: IssuesService) {}

  @Get()
  @ApiOperation({ summary: 'Platforms in the current staff member’s scope.' })
  list(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.issues.listScopedPlatforms(staff);
  }
}
