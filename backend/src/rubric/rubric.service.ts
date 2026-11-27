import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

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

/**
 * Loads rubric.json — a library of ready-to-use question templates whose entries
 * follow the exact same question schema as inline questions in survey.config.json.
 * Referenced from the survey config as { "$use": "rubric:<key>" }.
 */
@Injectable()
export class RubricService implements OnModuleInit {
  questions: Record<string, any> = {};
  source = '';

  onModuleInit() {
    const p = resolveRubricPath();
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8'));
    this.questions = doc.questions ?? {};
    const bad = Object.entries(this.questions)
      .filter(([, q]: any) => !q || typeof q !== 'object' || !q.key || !q.type);
    if (bad.length > 0) {
      throw new Error(`rubric.json invalid — entries missing key/type: ${bad.map(([k]) => k).join(', ')}`);
    }
    this.source = p;
    console.log(`[rubric] loaded ${Object.keys(this.questions).length} question templates from ${p}`);
  }
}
