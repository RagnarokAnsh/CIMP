import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateIssueDto {
  @IsString()
  @Length(10, 5000, { message: 'Description must be between 10 and 5000 characters.' })
  description: string;

  // SDK diagnostics as a JSON STRING (the intake is multipart/form-data, so
  // every field arrives as a string). Parsed + sanitized in the service;
  // malformed JSON is dropped silently rather than failing the report.
  @IsOptional()
  @IsString()
  @MaxLength(65536, { message: 'Diagnostics context is too large.' })
  context?: string;
}
