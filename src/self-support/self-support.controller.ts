import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { SelfSupportService } from './self-support.service';

// Lets a signed-in staff member open the reporter intake for THIS platform.
// The minted token is delivered to the reporter surface exactly like a real
// portal hand-off (?handoff=...), so the whole integration path is exercised.
@ApiTags('self-support')
@ApiBearerAuth('staff')
@Controller('staff/support')
@UseGuards(JwtAuthGuard)
export class SelfSupportController {
  constructor(private readonly selfSupport: SelfSupportService) {}

  @Post('handoff')
  @ApiOperation({ summary: 'Mint a hand-off token so staff can file an issue about this platform.' })
  handoff(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.selfSupport.mintForStaff(staff);
  }
}
