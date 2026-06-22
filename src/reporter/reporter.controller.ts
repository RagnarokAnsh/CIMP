import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFiles,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { MAX_FILES, MAX_FILE_BYTES } from '../common/constants';
import { Handoff } from '../handoff/handoff-user.decorator';
import { HandoffGuard } from '../handoff/handoff.guard';
import { HandoffContext } from '../handoff/handoff.types';
import { contentDisposition } from '../common/content-disposition';
import { CreateIssueDto } from './dto/create-issue.dto';
import { ReporterCommentDto } from './dto/reporter-comment.dto';
import { ReporterService } from './reporter.service';

// Every route here is gated by the hand-off token — the reporter never logs in.
@Controller('reporter')
@UseGuards(HandoffGuard)
export class ReporterController {
  constructor(private readonly reporter: ReporterService) {}

  // The two-field intake: description + attachments. Rate-limited more strictly
  // than the global default to blunt abuse of the unauthenticated-feeling form.
  @Post('issues')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
    }),
  )
  createIssue(
    @Handoff() ctx: HandoffContext,
    @Body() dto: CreateIssueDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.reporter.createIssue(ctx, dto, files);
  }

  // The "My issues" tracking list.
  @Get('issues')
  listIssues(@Handoff() ctx: HandoffContext) {
    return this.reporter.listForReporter(ctx);
  }

  @Get('issues/:id')
  getIssue(
    @Handoff() ctx: HandoffContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reporter.getIssueForReporter(ctx, id);
  }

  @Post('issues/:id/seen')
  markSeen(
    @Handoff() ctx: HandoffContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reporter.markSeen(ctx, id);
  }

  // Reporter replies back to support (always reporter-visible).
  @Post('issues/:id/comments')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  addComment(
    @Handoff() ctx: HandoffContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReporterCommentDto,
  ) {
    return this.reporter.addComment(ctx, id, dto);
  }

  // Scoped, scan-gated download of the reporter's own attachment.
  @Get('issues/:id/attachments/:attachmentId')
  async downloadAttachment(
    @Handoff() ctx: HandoffContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const file = await this.reporter.getAttachmentForReporter(ctx, id, attachmentId);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', contentDisposition(file.filename));
    res.send(file.buffer);
  }
}
