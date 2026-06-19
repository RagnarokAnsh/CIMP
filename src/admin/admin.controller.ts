import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { Roles } from '../authz/roles.decorator';
import { RolesGuard } from '../authz/roles.guard';
import { AdminService } from './admin.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

// Admin-only. RolesGuard (not PlatformAccessGuard) because these routes carry
// platform/role ids, not issue ids, and ADMIN is always global.
@ApiTags('admin')
@ApiBearerAuth('staff')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

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
}
