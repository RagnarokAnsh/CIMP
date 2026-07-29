import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { CannedResponsesService } from './canned-responses.service';
import { CreateCannedResponseDto, UpdateCannedResponseDto } from './dto/canned-response.dto';

// Per-platform reply templates. This route carries a platformId (not an issue
// id), so the service does the scope check (write-role only) — same shape as the
// labels catalog and automation-rule controllers.
@ApiTags('staff-canned-responses')
@ApiBearerAuth('staff')
@Controller('staff/platforms/:platformId/canned-responses')
@UseGuards(JwtAuthGuard)
export class CannedResponsesController {
  constructor(private readonly canned: CannedResponsesService) {}

  @Get()
  @ApiOperation({ summary: "List a platform's reply templates." })
  list(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
  ) {
    return this.canned.list(staff, platformId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a reply template.' })
  create(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Body() dto: CreateCannedResponseDto,
  ) {
    return this.canned.create(staff, platformId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a reply template.' })
  update(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCannedResponseDto,
  ) {
    return this.canned.update(staff, platformId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a reply template.' })
  remove(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.canned.remove(staff, platformId, id);
  }
}
