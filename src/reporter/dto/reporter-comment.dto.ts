import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

// A reporter's reply to support. Always reporter-visible; no @mentions or
// visibility choice (those are staff-only concepts).
export class ReporterCommentDto {
  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  body: string;
}
