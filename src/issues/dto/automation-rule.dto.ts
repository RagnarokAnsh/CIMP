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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  actionValue?: string;
}
