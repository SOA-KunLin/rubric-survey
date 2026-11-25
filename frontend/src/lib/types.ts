export interface Bilingual {
  en: string;
  zh: string;
}

export interface QuestionOption {
  value: number | string;
  short?: Bilingual;
  label?: Bilingual;
  anchor?: Bilingual;
}

export type QuestionType = 'anchor' | 'singleChoice' | 'checkboxes' | 'dropdown' | 'text' | 'number' | 'yesno';

export interface ResolvedQuestion {
  key: string;
  type: QuestionType;
  names: Bilingual;
  ref?: string;
  refZh?: string;
  required: boolean;
  appliesIf?: { hasResponseB?: boolean };
  options?: QuestionOption[];
  min?: number;
  max?: number;
  placeholder?: Bilingual;
}

export interface ContentBlock {
  key: string;
  label: Bilingual;
  style: 'paragraph' | 'bubble-patient' | 'bubble-assistant' | 'response' | 'source';
  collapsible?: boolean;
}

export interface SiteConfig {
  title: Bilingual;
  subtitle: Bilingual;
  theme: string;
  themeColors?: Record<string, string>;
  defaultLang: 'en' | 'zh';
  allowLangToggle: boolean;
  showNotes: boolean;
  instruction?: Bilingual;
  references?: string[];
}

export interface QuestionGroup {
  instruction?: Bilingual;
  references?: string[];
  keys: string[];
}

export interface ResolvedCase {
  id: string;
  order: number;
  active: boolean;
  title: Bilingual;
  data: Record<string, string>;
  content: ContentBlock[];
  questions: ResolvedQuestion[];
  requiredCount: number;
  questionGroups: QuestionGroup[];
  myStatus?: string;
  myUpdatedAt?: string | null;
  mySubmittedAt?: string | null;
  answeredCount?: number;
}

export interface SurveyConfig {
  site: SiteConfig;
  cases: ResolvedCase[];
}

export interface Rating {
  id?: string;
  raterId: string;
  caseId: string;
  scores: Record<string, any>;
  notes: string;
  status: 'draft' | 'submitted';
  submittedAt?: string | null;
  updatedAt?: string;
}
