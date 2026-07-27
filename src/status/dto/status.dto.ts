import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID,
  MaxLength, Min, MinLength,
} from 'class-validator';
import { ComponentStatus, IncidentImpact, IncidentStatus } from '../../common/enums';

export class CreateComponentDto {
  @ApiProperty()
  @IsString() @MinLength(1) @MaxLength(80)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ enum: ComponentStatus })
  @IsOptional() @IsEnum(ComponentStatus)
  status?: ComponentStatus;

  @ApiPropertyOptional({ description: 'Display order on the public page.' })
  @IsOptional() @IsInt() @Min(0)
  position?: number;
}

export class UpdateComponentDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ enum: ComponentStatus })
  @IsOptional() @IsEnum(ComponentStatus)
  status?: ComponentStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  position?: number;
}

export class CreateIncidentDto {
  @ApiProperty()
  @IsString() @MinLength(1) @MaxLength(140)
  title: string;

  @ApiProperty({ description: 'First public update — what you know right now.' })
  @IsString() @MinLength(1) @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional() @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: IncidentImpact })
  @IsOptional() @IsEnum(IncidentImpact)
  impact?: IncidentImpact;

  @ApiPropertyOptional({ description: 'Affected component ids (must belong to this platform).' })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true })
  componentIds?: string[];
}

// Posting an update is how an incident progresses: the incident takes the
// update's status, and RESOLVED stamps resolvedAt.
export class AddIncidentUpdateDto {
  @ApiProperty({ enum: IncidentStatus })
  @IsEnum(IncidentStatus)
  status: IncidentStatus;

  @ApiProperty()
  @IsString() @MinLength(1) @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({ description: 'Optionally set affected components to this exact set.' })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true })
  componentIds?: string[];
}
