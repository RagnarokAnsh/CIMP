import {
  Controller, Get, Param, ParseUUIDPipe, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { AttachmentsService } from './attachments.service';

@ApiTags('staff-attachments')
@ApiBearerAuth('staff')
@Controller('staff/attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  // Access-checked download; refuses PENDING/INFECTED files.
  @Get(':id/download')
  @ApiOperation({ summary: 'Download an attachment (scoped, scan-gated).' })
  async download(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const file = await this.attachments.getForStaff(staff, id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  }
}
