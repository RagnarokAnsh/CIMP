import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { AutomationService } from './automation.service';
import { CreateAutomationRuleDto, UpdateAutomationRuleDto } from './dto/automation-rule.dto';

// Manage a platform's automation rules. Platform-scoped in the service (this
// route carries a platformId, not an issue id).
@ApiTags('staff-automation')
@ApiBearerAuth('staff')
@Controller('staff/platforms/:platformId/automation-rules')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get()
  @ApiOperation({ summary: "List a platform's automation rules." })
  list(@CurrentStaff() staff: AuthenticatedStaff, @Param('platformId', ParseUUIDPipe) platformId: string) {
    return this.automation.listForPlatform(staff, platformId);
  }

  @Post()
  @ApiOperation({ summary: 'Create an automation rule.' })
  create(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Body() dto: CreateAutomationRuleDto,
  ) {
    return this.automation.create(staff, platformId, dto);
  }

  @Patch(':ruleId')
  @ApiOperation({ summary: 'Update / enable / disable a rule.' })
  update(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateAutomationRuleDto,
  ) {
    return this.automation.update(staff, platformId, ruleId, dto);
  }

  @Delete(':ruleId')
  @ApiOperation({ summary: 'Delete a rule.' })
  remove(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ) {
    return this.automation.remove(staff, platformId, ruleId);
  }
}
