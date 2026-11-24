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

export interface Turn {
  role: 'patient' | 'assistant';
  content: string;
}

export interface EvalCase {
  id: string;
  order: number;
  title: string;
  titleZh: string;
  scenario: string;
  scenarioZh: string;
  conversation: Turn[] | null;
  patientQuery: string;
  responseA: string;
  responseB: string | null;
  sourceTitle: string;
  sourceText: string | null;
  active: boolean;
  createdAt?: string;
  myStatus?: string;
  myUpdatedAt?: string | null;
  mySubmittedAt?: string | null;
  requiredDimensions?: number;
  answeredDimensions?: number;
}

export interface Rating {
  id?: string;
  raterId: string;
  caseId: string;
  scores: Record<string, number | null>;
  notes: string;
  status: 'draft' | 'submitted';
  submittedAt?: string | null;
  updatedAt?: string;
}

export const rubric: Rubric = require('../data/rubric.json');
