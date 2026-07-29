import {
  Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { StatusService } from './status.service';
import {
  AddIncidentUpdateDto, CreateComponentDto, CreateIncidentDto, UpdateComponentDto,
} from './dto/status.dto';

// Staff management of a platform's public status page. These routes carry a
// platformId (not an issue id), so the service does the write-role scope check —
// the same shape as the labels/canned-response/automation controllers.
@ApiTags('staff-status-page')
@ApiBearerAuth('staff')
@Controller('staff/platforms/:platformId/status')
@UseGuards(JwtAuthGuard)
export class StaffStatusController {
  constructor(private readonly status: StatusService) {}

  @Get('components')
  @ApiOperation({ summary: "List a platform's status components." })
  listComponents(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
  ) {
    return this.status.listComponents(staff, platformId);
  }

  @Post('components')
  @ApiOperation({ summary: 'Add a status component.' })
  createComponent(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Body() dto: CreateComponentDto,
  ) {
    return this.status.createComponent(staff, platformId, dto);
  }

  @Patch('components/:componentId')
  @ApiOperation({ summary: "Update a component's name/description/status/order." })
  updateComponent(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @Body() dto: UpdateComponentDto,
  ) {
    return this.status.updateComponent(staff, platformId, componentId, dto);
  }

  @Delete('components/:componentId')
  @ApiOperation({ summary: 'Delete a status component.' })
  deleteComponent(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Param('componentId', ParseUUIDPipe) componentId: string,
  ) {
    return this.status.deleteComponent(staff, platformId, componentId);
  }

  @Get('incidents')
  @ApiOperation({ summary: "List a platform's incidents (newest first)." })
  listIncidents(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
  ) {
    return this.status.listIncidents(staff, platformId);
  }

  @Post('incidents')
  @ApiOperation({ summary: 'Open an incident (publishes immediately).' })
  createIncident(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Body() dto: CreateIncidentDto,
  ) {
    return this.status.createIncident(staff, platformId, dto);
  }

  @Post('incidents/:incidentId/updates')
  @ApiOperation({ summary: 'Post a public update; the incident takes this status.' })
  addUpdate(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: AddIncidentUpdateDto,
  ) {
    return this.status.addIncidentUpdate(staff, platformId, incidentId, dto);
  }

  @Delete('incidents/:incidentId')
  @ApiOperation({ summary: 'Delete an incident and its public timeline.' })
  deleteIncident(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
  ) {
    return this.status.deleteIncident(staff, platformId, incidentId);
  }
}

// Unauthenticated by design — this is the public status page. Returns ONLY
// staff-authored, deliberately-published content. CORS is opened for this GET so
// connected apps can render a status banner straight from the browser (matching
// the known-issues endpoint in deflection.controllers.ts).
@ApiTags('public')
@Controller('public')
export class PublicStatusController {
  constructor(private readonly status: StatusService) {}

  @Get('platforms/:key/status')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Public status page for a platform (components + incidents).' })
  status_(@Param('key') key: string) {
    return this.status.publicStatus(key);
  }
}
