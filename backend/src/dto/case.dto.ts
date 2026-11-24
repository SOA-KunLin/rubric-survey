import { IsString, IsOptional, IsBoolean, IsInt, IsArray } from 'class-validator';

export class UpsertCaseDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  titleZh?: string;

  @IsOptional()
  @IsString()
  scenario?: string;

  @IsOptional()
  @IsString()
  scenarioZh?: string;

  @IsOptional()
  conversation?: { role: 'patient' | 'assistant'; content: string }[] | null;

  @IsString()
  patientQuery!: string;

  @IsString()
  responseA!: string;

  @IsOptional()
  @IsString()
  responseB?: string;

  @IsOptional()
  @IsString()
  sourceTitle?: string;

  @IsOptional()
  @IsString()
  sourceText?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PatchCaseDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}
