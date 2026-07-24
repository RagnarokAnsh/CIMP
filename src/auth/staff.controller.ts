import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentStaff } from './current-staff.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedStaff } from './auth.types';

@ApiTags('staff')
@ApiBearerAuth('staff')
@Controller('staff')
@UseGuards(JwtAuthGuard)
export class StaffController {
  // ConfigModule is global (app.module.ts), so AuthModule needs no extra import.
  constructor(private readonly config: ConfigService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Current staff profile, role assignments, and policy flags the UI gates on.',
  })
  me(@CurrentStaff() staff: AuthenticatedStaff) {
    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      roles: staff.roles,
      // OD-09 seam echoed for UI gating only: without it the frontend shows
      // focal points status-transition buttons that IssuesService.assertCanTransition
      // always 403s. The server stays the enforcement point — never trust this value.
      policy: {
        focalPointCanTransition: this.config.get<boolean>('focalPointCanTransition') ?? false,
      },
    };
  }
}
