import {
  Body, Controller, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { Roles } from '../authz/roles.decorator';
import { PlatformAccessGuard } from '../authz/platform-access.guard';
import { STAFF_WRITE_ROLES } from '../authz/role-sets';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('staff-comments')
@ApiBearerAuth('staff')
@Controller('staff')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  // Issue-scoped: PlatformAccessGuard resolves the platform from :id.
  @Post('issues/:id/comments')
  @UseGuards(PlatformAccessGuard)
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Add a comment (internal or reporter-visible).' })
  add(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.addComment(staff, id, dto);
  }

  // Ownership-scoped (the :id here is a comment id), checked in the service.
  @Patch('comments/:id')
  @ApiOperation({ summary: 'Edit your own comment.' })
  edit(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.comments.editComment(staff, id, dto);
  }
}
