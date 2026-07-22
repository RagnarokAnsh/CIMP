import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { Roles } from '../authz/roles.decorator';
import { RolesGuard } from '../authz/roles.guard';
import { AuditService } from '../audit/audit.service';
import { AdminService } from './admin.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AuditQueryDto } from './dto/audit-query.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { SetPasswordDto } from './dto/set-password.dto';

// Admin-only. RolesGuard (not PlatformAccessGuard) because these routes carry
// platform/role ids, not issue ids, and ADMIN is always global.
@ApiTags('admin')
@ApiBearerAuth('staff')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('platforms')
  @ApiOperation({ summary: 'List platforms.' })
  listPlatforms() {
    return this.admin.listPlatforms();
  }

  @Post('platforms')
  @ApiOperation({ summary: 'Create a platform.' })
  createPlatform(@CurrentStaff() staff: AuthenticatedStaff, @Body() dto: CreatePlatformDto) {
    return this.admin.createPlatform(staff, dto);
  }

  @Patch('platforms/:id')
  @ApiOperation({ summary: 'Update a platform.' })
  updatePlatform(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformDto,
  ) {
    return this.admin.updatePlatform(staff, id, dto);
  }

  @Delete('platforms/:id')
  @ApiOperation({
    summary: 'Delete a platform. Only when it holds no issues — otherwise 409; '
      + 'disable it instead (PATCH status=DISABLED) to retire it with its history.',
  })
  deletePlatform(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.deletePlatform(staff, id);
  }

  @Post('platforms/:id/rotate-secret')
  @ApiOperation({ summary: 'Rotate the hand-off signing secret (returned once).' })
  rotateSecret(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.rotateSecret(staff, id);
  }

  @Get('staff')
  @ApiOperation({ summary: 'List staff users and their role assignments.' })
  listStaff() {
    return this.admin.listStaff();
  }

  @Post('staff')
  @ApiOperation({ summary: 'Create a staff user with a password (self-issued JWT login).' })
  createStaff(@CurrentStaff() staff: AuthenticatedStaff, @Body() dto: CreateStaffDto) {
    return this.admin.createStaff(staff, dto);
  }

  @Patch('staff/:id')
  @ApiOperation({
    summary: 'Update a staff user. status=DISABLED offboards them (login refused, '
      + 'live tokens rejected on the next request); changing email re-keys their login.',
  })
  updateStaff(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.admin.updateStaff(staff, id, dto);
  }

  @Delete('staff/:id')
  @ApiOperation({
    summary: 'Delete a staff user permanently. Prefer PATCH status=DISABLED, which '
      + 'ends access just as fast and keeps their comment attribution.',
  })
  deleteStaff(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.deleteStaff(staff, id);
  }

  @Post('staff/:id/password')
  @ApiOperation({ summary: "Set or reset a staff member's password." })
  setStaffPassword(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPasswordDto,
  ) {
    return this.admin.setStaffPassword(staff, id, dto);
  }

  @Post('roles')
  @ApiOperation({ summary: 'Assign a role to a staff user.' })
  assignRole(@CurrentStaff() staff: AuthenticatedStaff, @Body() dto: AssignRoleDto) {
    return this.admin.assignRole(staff, dto);
  }

  @Delete('roles/:id')
  @ApiOperation({ summary: 'Revoke a role assignment.' })
  revokeRole(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.revokeRole(staff, id);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Query the audit log (filterable, paginated).' })
  auditLog(@Query() query: AuditQueryDto) {
    return this.audit.query(query);
  }
}
