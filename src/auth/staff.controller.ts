import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentStaff } from './current-staff.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedStaff } from './auth.types';

@ApiTags('staff')
@ApiBearerAuth('staff')
@Controller('staff')
@UseGuards(JwtAuthGuard)
export class StaffController {
  @Get('me')
  @ApiOperation({ summary: 'Current staff profile and role assignments.' })
  me(@CurrentStaff() staff: AuthenticatedStaff) {
    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      roles: staff.roles,
    };
  }
}
