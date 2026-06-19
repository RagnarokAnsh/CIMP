import { IsString, Length } from 'class-validator';

export class CreateIssueDto {
  @IsString()
  @Length(10, 5000, { message: 'Description must be between 10 and 5000 characters.' })
  description: string;
}
