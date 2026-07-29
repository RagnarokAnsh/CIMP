import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Handoff } from '../handoff/handoff-user.decorator';
import { HandoffGuard } from '../handoff/handoff.guard';
import { HandoffContext } from '../handoff/handoff.types';
import { CsatService } from './csat.service';
import { SubmitCsatDto } from './dto/submit-csat.dto';

// Reporter-facing, hand-off-token gated like every /reporter route.
@Controller('reporter/issues')
@UseGuards(HandoffGuard)
export class CsatController {
  constructor(private readonly csat: CsatService) {}

  @Post(':id/csat')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  submit(
    @Handoff() ctx: HandoffContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitCsatDto,
  ) {
    return this.csat.submit(ctx, id, dto);
  }
}
