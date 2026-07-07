import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { Roles } from '../authz/roles.decorator';
import { PlatformAccessGuard } from '../authz/platform-access.guard';
import { STAFF_READ_ROLES, STAFF_WRITE_ROLES } from '../authz/role-sets';
import { CreateIssueLinkDto } from './dto/create-issue-link.dto';
import { IssueLinksService } from './issue-links.service';

// Issue links. PlatformAccessGuard resolves the :id issue's platform and
// enforces the caller holds one of the route's roles for it (scoped, like every
// other issue route). Write roles may link; any read role may list.
@ApiTags('staff-issue-links')
@ApiBearerAuth('staff')
@Controller('staff/issues/:id/links')
@UseGuards(JwtAuthGuard, PlatformAccessGuard)
export class IssueLinksController {
  constructor(private readonly links: IssueLinksService) {}

  @Get()
  @Roles(...STAFF_READ_ROLES)
  @ApiOperation({ summary: "List an issue's links (inward + outward)." })
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.links.listForIssue(id);
  }

  @Post()
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Link this issue to another (same platform).' })
  create(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateIssueLinkDto,
  ) {
    return this.links.create(staff, id, dto);
  }

  @Delete(':linkId')
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Remove a link.' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ) {
    return this.links.remove(id, linkId);
  }
}
