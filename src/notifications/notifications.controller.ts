import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { NotificationsService } from './notifications.service';

// A staff member's own notification feed. No platform-scope guard needed — every
// row is keyed to the authenticated recipient, so there is nothing cross-tenant
// to leak.
@ApiTags('staff-notifications')
@ApiBearerAuth('staff')
@Controller('staff/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Recent notifications for the current staff member, with unread count.' })
  list(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.notifications.listForStaff(staff.id);
  }

  @Post('read')
  @ApiOperation({ summary: 'Mark all of the current staff member’s notifications as read.' })
  markRead(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.notifications.markAllRead(staff.id);
  }
}
