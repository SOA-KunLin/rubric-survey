import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface RubricLevel {
  score: number;
  short: { en: string; zh: string };
  anchor: { en: string; zh: string };
}

export interface RubricDimension {
  key: string;
  order: number;
  requires: string | null;
  names: { en: string; zh: string };
  ref: string;
  refZh?: string;
  levels: RubricLevel[];
}

export interface Rubric {
  version: string;
  scoringInstruction: { en: string; zh: string };
  references: string[];
  dimensions: RubricDimension[];
}

function resolveRubricPath(): string {
  const candidates = [
    process.env.RUBRIC_PATH,
    path.join(process.cwd(), 'rubric.json'),
    path.join(process.cwd(), '..', 'rubric.json'),
    path.join(process.cwd(), '..', '..', 'rubric.json'),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('rubric.json not found; set RUBRIC_PATH');
}

@Injectable()
export class RubricService implements OnModuleInit {
  rubric: Rubric;

  onModuleInit() {
    const p = resolveRubricPath();
    this.rubric = JSON.parse(fs.readFileSync(p, 'utf-8'));
    console.log(`[rubric] loaded ${this.rubric.dimensions.length} dimensions from ${p}`);
  }

  get dimensions(): RubricDimension[] {
    return [...this.rubric.dimensions].sort((a, b) => a.order - b.order);
  }

  requiredDimensions(hasResponseB: boolean): RubricDimension[] {
    return this.dimensions.filter((d) => !d.requires || (d.requires === 'responseB' && hasResponseB));
  }

  dimensionKeys(hasResponseB: boolean): string[] {
    return this.requiredDimensions(hasResponseB).map((d) => d.key);
  }

  validateScores(scores: Record<string, any>, hasResponseB: boolean): string[] {
    const errors: string[] = [];
    for (const d of this.requiredDimensions(hasResponseB)) {
      const v = scores?.[d.key];
      if (v === undefined || v === null || !Number.isInteger(v) || v < 1 || v > 5) {
        errors.push(d.key);
      }
    }
    return errors;
  }
}
