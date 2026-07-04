import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ApiTokensService } from './api-tokens.service';
import { ApiTokenGuard } from './api-token.guard';
import { CreateApiTokenDto } from './dto/create-api-token.dto';

// Staff-facing management of a platform's API tokens (platform-scoped).
@ApiTags('staff-api-tokens')
@ApiBearerAuth('staff')
@Controller('staff/platforms/:platformId/api-tokens')
@UseGuards(JwtAuthGuard)
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get()
  @ApiOperation({ summary: "List a platform's API tokens (no secrets)." })
  list(@CurrentStaff() staff: AuthenticatedStaff, @Param('platformId', ParseUUIDPipe) platformId: string) {
    return this.tokens.list(staff, platformId);
  }

  @Post()
  @ApiOperation({ summary: 'Create an API token (plaintext returned once).' })
  create(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Body() dto: CreateApiTokenDto,
  ) {
    return this.tokens.create(staff, platformId, dto.name);
  }

  @Delete(':tokenId')
  @ApiOperation({ summary: 'Revoke an API token.' })
  revoke(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ) {
    return this.tokens.revoke(staff, platformId, tokenId);
  }
}

// Token-authenticated, read-only issue access for integrations. The token binds
// the request to a single platform.
@ApiTags('integrations')
@Controller('integrations/issues')
@UseGuards(ApiTokenGuard)
export class IntegrationIssuesController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get()
  @ApiOperation({ summary: "List the token's platform issues (Bearer API token)." })
  list(
    @Req() req: Request & { apiToken: { platformId: string } },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.tokens.listIssues(req.apiToken.platformId, Number(page) || 1, Number(pageSize) || 50);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one issue on the token\'s platform.' })
  get(
    @Req() req: Request & { apiToken: { platformId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tokens.getIssue(req.apiToken.platformId, id);
  }
}
