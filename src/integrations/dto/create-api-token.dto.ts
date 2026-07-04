import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateApiTokenDto {
  @ApiProperty({ description: 'A label to identify this token (e.g. "Grafana dashboard").' })
  @IsString()
  @Length(1, 80)
  name: string;
}
