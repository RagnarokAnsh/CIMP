import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { Roles } from '../authz/roles.decorator';
import { PlatformAccessGuard } from '../authz/platform-access.guard';
import { STAFF_READ_ROLES, STAFF_WRITE_ROLES } from '../authz/role-sets';
import { IssuesService } from './issues.service';
import { toCsv } from './issues.csv';
import { ListIssuesDto } from './dto/list-issues.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { BulkUpdateDto } from './dto/bulk-update.dto';

@ApiTags('staff-issues')
@ApiBearerAuth('staff')
@Controller('staff/issues')
@UseGuards(JwtAuthGuard, PlatformAccessGuard)
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get()
  @Roles(...STAFF_READ_ROLES)
  @ApiOperation({ summary: 'List issues (scoped, filterable, paginated).' })
  list(@CurrentStaff() staff: AuthenticatedStaff, @Query() query: ListIssuesDto) {
    return this.issues.list(staff, query);
  }

  @Get('export')
  @Roles(...STAFF_READ_ROLES)
  @ApiOperation({ summary: 'CSV export of the filtered, scoped list.' })
  async export(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Query() query: ListIssuesDto,
    @Res() res: Response,
  ) {
    const rows = await this.issues.listAllForExport(staff, query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="issues.csv"');
    res.send(toCsv(rows));
  }

  @Get(':id')
  @Roles(...STAFF_READ_ROLES)
  @ApiOperation({ summary: 'Full issue detail (all comments, attachments, history).' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.issues.getDetail(id);
  }

  // Powers the assignment dropdown — write-role only (watchers cannot assign).
  @Get(':id/assignees')
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Active developers who can be assigned this issue.' })
  assignees(@Param('id', ParseUUIDPipe) id: string) {
    return this.issues.listAssignees(id);
  }

  // Powers the @mention picker — write-role only (watchers cannot comment).
  @Get(':id/members')
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Active staff on this issue’s platform (for @mentions).' })
  members(@Param('id', ParseUUIDPipe) id: string) {
    return this.issues.listPlatformMembers(id);
  }

  @Patch('bulk')
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Bulk change status/priority/assignee across issues in scope.' })
  bulk(@CurrentStaff() staff: AuthenticatedStaff, @Body() dto: BulkUpdateDto) {
    return this.issues.bulkUpdate(staff, dto);
  }

  @Patch(':id/status')
  // Platform access for the write roles; the service applies the OD-09 focal-point gate.
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Change status (state machine enforced).' })
  changeStatus(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.issues.changeStatus(staff, id, dto);
  }

  @Patch(':id/assignment')
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Assign/reassign to a developer of this platform.' })
  changeAssignment(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.issues.changeAssignment(staff, id, dto);
  }

  @Patch(':id/priority')
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Set priority.' })
  changePriority(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriorityDto,
  ) {
    return this.issues.changePriority(staff, id, dto);
  }
}
