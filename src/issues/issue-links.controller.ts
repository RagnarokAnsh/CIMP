import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { Roles } from '../authz/roles.decorator';
import { PlatformAccessGuard } from '../authz/platform-access.guard';
import { CreateIssueLinkDto } from './dto/create-issue-link.dto';
import { IssueLinksService } from './issue-links.service';

// Issue links. PlatformAccessGuard resolves the :id issue's platform and
// enforces the caller holds one of these roles for it (scoped, like every other
// issue route). Triage roles may link.
@ApiTags('staff-issue-links')
@ApiBearerAuth('staff')
@Controller('staff/issues/:id/links')
@UseGuards(JwtAuthGuard, PlatformAccessGuard)
@Roles(Role.FOCAL_POINT, Role.DEVELOPER, Role.ADMIN)
export class IssueLinksController {
  constructor(private readonly links: IssueLinksService) {}

  @Get()
  @ApiOperation({ summary: "List an issue's links (inward + outward)." })
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.links.listForIssue(id);
  }

  @Post()
  @ApiOperation({ summary: 'Link this issue to another (same platform).' })
  create(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateIssueLinkDto,
  ) {
    return this.links.create(staff, id, dto);
  }

  @Delete(':linkId')
  @ApiOperation({ summary: 'Remove a link.' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ) {
    return this.links.remove(id, linkId);
  }
}
