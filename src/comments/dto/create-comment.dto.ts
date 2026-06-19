import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, Length,
} from 'class-validator';
import { CommentVisibility } from '../../common/enums';

export class CreateCommentDto {
  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  body: string;

  @ApiProperty({ enum: CommentVisibility, default: CommentVisibility.INTERNAL })
  @IsEnum(CommentVisibility)
  visibility: CommentVisibility = CommentVisibility.INTERNAL;

  @ApiPropertyOptional({ type: [String], description: 'Staff ids to @mention (notified in-app).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  mentionStaffIds?: string[];
}
