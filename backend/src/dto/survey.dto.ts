import { IsString, IsOptional } from 'class-validator';

export class SaveDraftDto {
  @IsOptional()
  scores!: Record<string, number | null>;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitDto {
  @IsOptional()
  scores!: Record<string, number | null>;

  @IsOptional()
  @IsString()
  notes?: string;
}
