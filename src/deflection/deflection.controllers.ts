import {
  Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Handoff } from '../handoff/handoff-user.decorator';
import { HandoffGuard } from '../handoff/handoff.guard';
import { HandoffContext } from '../handoff/handoff.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { Roles } from '../authz/roles.decorator';
import { PlatformAccessGuard } from '../authz/platform-access.guard';
import { STAFF_WRITE_ROLES } from '../authz/role-sets';
import { DeflectionService } from './deflection.service';
import { SimilarIssuesQueryDto, SubscribeDto } from './dto/deflection.dto';
import { PublishIssueDto } from './dto/publish-issue.dto';

// Reporter-facing deflection, hand-off gated. Path is /reporter/similar-issues
// (not /reporter/issues/similar) to stay clear of the ':id' route in
// ReporterController.
@ApiTags('reporter-deflection')
@Controller('reporter')
@UseGuards(HandoffGuard)
export class DeflectionReporterController {
  constructor(private readonly deflection: DeflectionService) {}

  @Get('similar-issues')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Privacy-safe matches for a draft description (status/age/count only).' })
  similar(@Handoff() ctx: HandoffContext, @Query() query: SimilarIssuesQueryDto) {
    return this.deflection.findSimilar(ctx, query.q);
  }

  @Post('subscriptions')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Follow an existing issue instead of filing a duplicate.' })
  subscribe(@Handoff() ctx: HandoffContext, @Body() dto: SubscribeDto) {
    return this.deflection.subscribe(ctx, dto.token);
  }
}

@ApiTags('staff-issues')
@ApiBearerAuth('staff')
@Controller('staff/issues')
@UseGuards(JwtAuthGuard, PlatformAccessGuard)
export class PublishController {
  constructor(private readonly deflection: DeflectionService) {}

  @Patch(':id/publish')
  @Roles(...STAFF_WRITE_ROLES)
  @ApiOperation({ summary: 'Publish/unpublish this issue in the public known-issues feed.' })
  publish(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishIssueDto,
  ) {
    return this.deflection.publish(staff, id, dto);
  }
}

// Unauthenticated by design: returns ONLY staff-curated titles of explicitly
// published issues. CORS is opened for this one GET so connected apps can
// render the known-issues banner directly from the browser.
@ApiTags('public')
@Controller('public')
export class PublicKnownIssuesController {
  constructor(private readonly deflection: DeflectionService) {}

  @Get('platforms/:key/known-issues')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Published known issues for a platform (public, curated titles only).' })
  knownIssues(@Param('key') key: string) {
    return this.deflection.publicKnownIssues(key);
  }
}
