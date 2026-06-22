import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { SavedViewsService } from './saved-views.service';
import { SaveViewDto } from './dto/save-view.dto';

// Per-staff saved issue-list views. Scoped to the caller — no cross-user access.
@ApiTags('staff-saved-views')
@ApiBearerAuth('staff')
@Controller('staff/saved-views')
@UseGuards(JwtAuthGuard)
export class SavedViewsController {
  constructor(private readonly views: SavedViewsService) {}

  @Get()
  @ApiOperation({ summary: 'List your saved views.' })
  list(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.views.list(staff.id);
  }

  @Put()
  @ApiOperation({ summary: 'Create or update a saved view (by name).' })
  save(@CurrentStaff() staff: AuthenticatedStaff, @Body() dto: SaveViewDto) {
    return this.views.save(staff.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a saved view.' })
  remove(@CurrentStaff() staff: AuthenticatedStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.views.remove(staff.id, id);
  }
}
