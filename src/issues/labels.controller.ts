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
import { LabelsService } from './labels.service';
import { AddIssueLabelDto, CreateLabelDto } from './dto/label.dto';

// Per-platform label catalog. Access is scoped to the platform in the service
// (this route carries a platformId, not an issue id, so the issue guard's
// :id branch doesn't apply).
@ApiTags('staff-labels')
@ApiBearerAuth('staff')
@Controller('staff/platforms/:platformId/labels')
@UseGuards(JwtAuthGuard)
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  @ApiOperation({ summary: "List a platform's label catalog." })
  list(@CurrentStaff() staff: AuthenticatedStaff, @Param('platformId', ParseUUIDPipe) platformId: string) {
    return this.labels.listForPlatform(staff, platformId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a label on a platform.' })
  create(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Body() dto: CreateLabelDto,
  ) {
    return this.labels.createForPlatform(staff, platformId, dto);
  }

  @Delete(':labelId')
  @ApiOperation({ summary: 'Delete a label (removes it from all issues).' })
  remove(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
  ) {
    return this.labels.deleteForPlatform(staff, platformId, labelId);
  }
}

// Attach/detach labels on a specific issue. Scoped exactly like every other
// issue route via PlatformAccessGuard.
@ApiTags('staff-issue-labels')
@ApiBearerAuth('staff')
@Controller('staff/issues/:id/labels')
@UseGuards(JwtAuthGuard, PlatformAccessGuard)
export class IssueLabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  @Roles(...STAFF_READ_ROLES)
  @ApiOperation({ summary: "List an issue's labels." })
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.labels.listForIssue(id);
  }

  @Post()
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Attach a label (from the issue\'s platform) to the issue.' })
  add(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddIssueLabelDto) {
    return this.labels.addToIssue(id, dto);
  }

  @Delete(':labelId')
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Remove a label from the issue.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Param('labelId', ParseUUIDPipe) labelId: string) {
    return this.labels.removeFromIssue(id, labelId);
  }
}
