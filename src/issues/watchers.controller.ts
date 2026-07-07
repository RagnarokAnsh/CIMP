import {
  Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { PlatformAccessGuard } from '../authz/platform-access.guard';
import { Roles } from '../authz/roles.decorator';
import { STAFF_READ_ROLES } from '../authz/role-sets';
import { WatchersService } from './watchers.service';

// Watch/unwatch an issue. Scoped like every issue route via PlatformAccessGuard;
// any staff with read access may watch — including the read-only WATCHER role,
// for whom subscribing to status changes is the whole point. (Explicit @Roles:
// the guard's un-decorated default is the write set.)
@ApiTags('staff-issue-watchers')
@ApiBearerAuth('staff')
@Controller('staff/issues/:id/watchers')
@UseGuards(JwtAuthGuard, PlatformAccessGuard)
@Roles(...STAFF_READ_ROLES)
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
