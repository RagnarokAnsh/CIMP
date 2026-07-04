import {
  Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { PlatformAccessGuard } from '../authz/platform-access.guard';
import { WatchersService } from './watchers.service';

// Watch/unwatch an issue. Scoped like every issue route via PlatformAccessGuard;
// any staff with access to the issue may watch it (no role restriction).
@ApiTags('staff-issue-watchers')
@ApiBearerAuth('staff')
@Controller('staff/issues/:id/watchers')
@UseGuards(JwtAuthGuard, PlatformAccessGuard)
export class WatchersController {
  constructor(private readonly watchers: WatchersService) {}

  @Get()
  @ApiOperation({ summary: "List an issue's watchers (+ whether you watch it)." })
  list(@CurrentStaff() staff: AuthenticatedStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.watchers.listForIssue(staff, id);
  }

  @Post()
  @ApiOperation({ summary: 'Watch this issue.' })
  watch(@CurrentStaff() staff: AuthenticatedStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.watchers.watch(staff, id);
  }

  @Delete()
  @ApiOperation({ summary: 'Stop watching this issue.' })
  unwatch(@CurrentStaff() staff: AuthenticatedStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.watchers.unwatch(staff, id);
  }
}
