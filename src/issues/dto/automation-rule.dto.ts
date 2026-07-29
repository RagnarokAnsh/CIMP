import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean, IsEnum, IsOptional, IsString, Length,
} from 'class-validator';
import { AutomationAction, AutomationTrigger, IssueStatus } from '../../common/enums';

export class CreateAutomationRuleDto {
  @ApiProperty()
  @IsString()
  @Length(1, 80)
  name: string;

  @ApiProperty({ enum: AutomationTrigger })
  @IsEnum(AutomationTrigger)
  trigger: AutomationTrigger;

  @ApiPropertyOptional({ enum: IssueStatus, description: 'For STATUS_CHANGED: match only this new status (omit = any).' })
  @IsOptional()
  @IsEnum(IssueStatus)
  triggerStatus?: IssueStatus;

  @ApiProperty({ enum: AutomationAction })
  @IsEnum(AutomationAction)
  action: AutomationAction;

  // Shape depends on `action` and the target has to exist on this platform, so
  // the real check is AutomationService.assertActionValue — this is only a
  // length guard.
  @ApiProperty({ description: 'Priority value | assignee staff id | label id, per action.' })
  @IsString()
  @Length(1, 200)
  actionValue: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateAutomationRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: AutomationTrigger })
  @IsOptional()
  @IsEnum(AutomationTrigger)
  trigger?: AutomationTrigger;

  @ApiPropertyOptional({ enum: IssueStatus })
  @IsOptional()
  @IsEnum(IssueStatus)
  triggerStatus?: IssueStatus;

  @ApiPropertyOptional({ enum: AutomationAction })
  @IsOptional()
  @IsEnum(AutomationAction)
  action?: AutomationAction;

  // Independently optional from `action`: the service validates the effective
  // pair (whatever is sent, falling back to the stored rule) so a half-update
  // can't leave an action pointing at a value meant for a different one.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  actionValue?: string;
}
