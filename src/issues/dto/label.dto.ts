import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsHexColor, IsOptional, IsString, IsUUID, Length,
} from 'class-validator';

export class CreateLabelDto {
  @ApiProperty()
  @IsString()
  @Length(1, 50)
  name: string;

  @ApiPropertyOptional({ example: '#2563eb', default: '#6b7280' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class AddIssueLabelDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  labelId: string;
}
