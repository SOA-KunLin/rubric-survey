import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RubricService } from '../rubric/rubric.service';

export type QuestionType = 'anchor' | 'singleChoice' | 'checkboxes' | 'dropdown' | 'text' | 'number' | 'yesno';

export interface QuestionOption {
  value: number | string;
  short?: { en: string; zh: string };
  label?: { en: string; zh: string };
  anchor?: { en: string; zh: string };
}

export interface ResolvedQuestion {
  key: string;
  type: QuestionType;
  names: { en: string; zh: string };
  ref?: string;
  refZh?: string;
  required: boolean;
  appliesIf?: { hasResponseB?: boolean };
  options?: QuestionOption[];
  min?: number;
  max?: number;
  placeholder?: { en: string; zh: string };
}

export interface ContentBlock {
  key: string;
  label: { en: string; zh: string };
  style: 'paragraph' | 'bubble-patient' | 'bubble-assistant' | 'response' | 'source';
  collapsible?: boolean;
}

export interface QuestionGroup {
  instruction?: { en: string; zh: string };
  references?: string[];
  keys: string[];
}

export interface ResolvedCase {
  id: string;
  order: number;
  active: boolean;
  title: { en: string; zh: string };
  data: Record<string, string>;
  content: ContentBlock[];
  questions: ResolvedQuestion[];
  requiredCount: number;
  questionGroups: QuestionGroup[];
}

export interface SiteConfig {
  title: { en: string; zh: string };
  subtitle: { en: string; zh: string };
  theme: string;
  themeColors?: Record<string, string>;
  defaultLang: 'en' | 'zh';
  allowLangToggle: boolean;
  showNotes: boolean;
  instruction?: { en: string; zh: string };
  references?: string[];
  auth?: { mode: 'open' | 'accounts'; accessCode: string };
}

export interface ResolvedConfig {
  site: SiteConfig;
  cases: ResolvedCase[];
}

const KNOWN_TYPES: QuestionType[] = ['anchor', 'singleChoice', 'checkboxes', 'dropdown', 'text', 'number', 'yesno'];
const CHOICE_TYPES: QuestionType[] = ['anchor', 'singleChoice', 'checkboxes', 'dropdown'];
const KNOWN_STYLES = ['paragraph', 'bubble-patient', 'bubble-assistant', 'response', 'source'];
const KNOWN_THEMES = ['light', 'dark', 'ocean', 'forest', 'high-contrast'];

function resolveConfigPath(): string {
  const candidates = [
    process.env.SURVEY_CONFIG_PATH,
    path.join(process.cwd(), 'survey.config.json'),
    path.join(process.cwd(), '..', 'survey.config.json'),
    path.join(process.cwd(), '..', '..', 'survey.config.json'),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('survey.config.json not found; set SURVEY_CONFIG_PATH');
}

function getByPointer(doc: any, pointer: string): any {
  if (!pointer.startsWith('#/')) throw new Error(`Bad $ref (must start with "#/"): ${pointer}`);
  const segs = pointer.slice(2).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = doc;
  for (const seg of segs) {
    if (cur === undefined || cur === null) throw new Error(`$ref target not found: ${pointer}`);
    cur = cur[seg];
  }
  if (cur === undefined) throw new Error(`$ref target not found: ${pointer}`);
  return cur;
}

function isPlainObject(v: any): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base: any, override: any): any {
  if (override === undefined) return base;
  // an empty override (pure "$use"/"$ref" reference) keeps the template value
  if (isPlainObject(override) && Object.keys(override).length === 0) return base;
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: any = { ...base };
    for (const k of Object.keys(override)) {
      out[k] = k in out ? deepMerge(out[k], override[k]) : override[k];
    }
    return out;
  }
  return override;
}

function stripKeys(node: any): any {
  if (!isPlainObject(node)) return node;
  const { $use, $ref, ...rest } = node;
  return rest;
}

/**
 * Normalize `questions` into an ordered list of groups.
 * Supported shapes:
 *   - bare array of question objects            -> one implicit group
 *   - object { items, instruction, references } -> one group
 *   - array mixing question objects and group objects { items, instruction, references }
 */
function parseQuestionGroups(qs: any): Array<{ instruction?: any; references?: any; items: any[] }> {
  if (Array.isArray(qs)) {
    const groups: Array<{ instruction?: any; references?: any; items: any[] }> = [];
    let flat: any[] = [];
    for (const el of qs) {
      if (isPlainObject(el) && Array.isArray(el.items)) {
        if (flat.length > 0) {
          groups.push({ items: flat });
          flat = [];
        }
        groups.push({ instruction: el.instruction, references: el.references, items: el.items });
      } else {
        flat.push(el);
      }
    }
    if (flat.length > 0) groups.push({ items: flat });
    return groups;
  }
  if (isPlainObject(qs)) {
    return [{ instruction: qs.instruction, references: qs.references, items: qs.items || [] }];
  }
  return [{ items: [] }];
}

@Injectable()
export class ConfigService implements OnModuleInit {
  configPath = '';
  raw: any = {};
  resolved!: ResolvedConfig;

  constructor(private rubric: RubricService) {}

  onModuleInit() {
    this.load();
  }

  load() {
    this.configPath = resolveConfigPath();
    this.raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    const errors = this.validate(this.raw);
    if (errors.length > 0) {
      throw new Error(`survey.config.json invalid:\n- ${errors.join('\n- ')}`);
    }
    this.resolved = this.resolveConfig(this.raw);
    console.log(
      `[config] loaded ${this.resolved.cases.length} cases (${this.resolved.cases.filter((c) => c.active).length} active) from ${this.configPath}`,
    );
  }

  // ---------- template resolution ----------
  /**
   * Resolve a "rubric:<dotted.path>" reference against rubric.json.
   *   rubric:questions.accuracy  -> rubric.json -> questions -> accuracy
   *   rubric:accuracy            -> legacy shorthand for rubric:questions.accuracy
   * Returns a deep copy (the same template may be merged into many cases).
   */
  private rubricTemplate(name: string): any {
    let path = name.slice('rubric:'.length);
    if (!path.startsWith('questions.')) path = `questions.${path}`;
    let cur: any = { questions: this.rubric.questions };
    for (const seg of path.split('.')) {
      if (cur === undefined || cur === null) return undefined;
      cur = cur[seg];
    }
    if (!cur) return undefined;
    const out = JSON.parse(JSON.stringify(cur));
    if (out.key === undefined) out.key = path.split('.').pop();
    if (out.required === undefined) out.required = true;
    return out;
  }

  private resolveNode(node: any, chain: string[], rootDoc: any): any {
    if (Array.isArray(node)) return node.map((n) => this.resolveNode(n, chain, rootDoc));
    if (!isPlainObject(node)) return node;
    if (node.$use || node.$ref) {
      let name = '';
      let base: any;
      if (node.$ref) {
        base = getByPointer(rootDoc, node.$ref);
        name = node.$ref;
      } else {
        name = node.$use;
        base = name.startsWith('rubric:') ? this.rubricTemplate(name) : rootDoc.templates?.[name];
      }
      if (base === undefined) throw new Error(`Unknown template/ref: "${name}"`);
      if (chain.includes(name)) throw new Error(`Circular template reference: ${chain.concat(name).join(' -> ')}`);
      const baseResolved = this.resolveNode(base, chain.concat(name), rootDoc);
      const inlineResolved = this.resolveNode(stripKeys(node), chain, rootDoc);
      return deepMerge(baseResolved, inlineResolved);
    }
    const out: any = {};
    for (const k of Object.keys(node)) out[k] = this.resolveNode(node[k], chain, rootDoc);
    return out;
  }

  /**
   * Walk a case (or any block subtree) and collect content blocks + question groups.
   * Dispatch is driven by "$class" first, then duck-typing, so cases may compose
   * ANY template directly: contentSet / questionGroup / content / question / case.
   */
  private collectCaseParts(
    node: any,
    site: any,
    out: { content: any[]; groups: Array<{ instruction?: any; references?: any; items: any[] }> },
    depth: number,
  ): void {
    if (depth > 8) return;
    if (Array.isArray(node)) {
      for (const n of node) this.collectCaseParts(n, site, out, depth + 1);
      return;
    }
    if (!isPlainObject(node)) return;
    const cls = node.$class;

    // questionGroup: a group with its items
    if (cls === 'questionGroup' || (Array.isArray(node.items) && (node.instruction !== undefined || node.references !== undefined))) {
      out.groups.push({ instruction: node.instruction, references: node.references, items: node.items });
      return;
    }
    // single question
    if (cls === 'question' || (node.key && node.type && Array.isArray(node.options))) {
      out.groups.push({ items: [node] });
      return;
    }
    // single content block
    if (cls === 'content' || (node.key && node.label !== undefined && !node.items && !node.options)) {
      if (node.key) out.content.push(node);
      return;
    }
    // containers: cases root / case / contentSet — expand their blocks (+ legacy keys)
    if (
      cls === 'cases' || cls === 'case' || cls === 'contentSet' ||
      node.blocks !== undefined || node.questionGroups !== undefined ||
      node.content !== undefined || node.questions !== undefined || node.items !== undefined
    ) {
      if (node.blocks !== undefined) this.collectCaseParts(node.blocks, site, out, depth + 1);
      if (Array.isArray(node.questionGroups)) this.collectCaseParts(node.questionGroups, site, out, depth + 1);
      if (node.content !== undefined) this.collectCaseParts(node.content, site, out, depth + 1);
      if (node.questions !== undefined) {
        out.groups.push(...parseQuestionGroups(node.questions));
      }
      if (Array.isArray(node.items)) {
        out.groups.push({ instruction: node.instruction, references: node.references, items: node.items });
      }
      return;
    }
    // bare typed question without inline options
    if (node.key && node.type) {
      out.groups.push({ items: [node] });
    }
  }

  private materializeCase(rc: any, site: any): ResolvedCase {
    const hasResponseB = !!rc.data?.responseB;
    const out = { content: [] as any[], groups: [] as Array<{ instruction?: any; references?: any; items: any[] }> };
    this.collectCaseParts(rc, site, out, 0);

    const content: ContentBlock[] = out.content.filter((b) => rc.data?.[b.key]);

    const serveQuestions: ResolvedQuestion[] = [];
    const questionGroups: QuestionGroup[] = [];
    for (const g of out.groups) {
      const served = g.items
        .map((q: any) => ({ ...q, required: q.required !== false }))
        .filter((q: any) => {
          if (!q.appliesIf) return true;
          if (q.appliesIf.hasResponseB) return hasResponseB;
          return true;
        });
      if (served.length === 0) continue;
      serveQuestions.push(...served);
      questionGroups.push({
        instruction: g.instruction ?? site?.instruction,
        references: g.references ?? site?.references,
        keys: served.map((q: any) => q.key),
      });
    }

    return {
      id: rc.id,
      order: typeof rc.order === 'number' ? rc.order : 100,
      active: rc.active !== false,
      title: rc.title || { en: rc.id, zh: rc.id },
      data: rc.data || {},
      content,
      questions: serveQuestions,
      requiredCount: serveQuestions.filter((q) => q.required).length,
      questionGroups,
    };
  }

  private resolveConfig(raw: any): ResolvedConfig {
    const resolvedRoot = this.resolveNode(raw, [], raw);
    const site = resolvedRoot.site || {};
    // auth defaults (config overrides env; env overrides built-in default)
    site.auth = {
      mode: site.auth?.mode ?? 'open',
      accessCode: site.auth?.accessCode ?? process.env.SURVEY_ACCESS_CODE ?? 'eval2026',
    };
    const casesNode = resolvedRoot.cases;
    const caseNodes: any[] = Array.isArray(casesNode)
      ? casesNode
      : isPlainObject(casesNode) && Array.isArray(casesNode.blocks)
        ? casesNode.blocks
        : [];
    const cases: ResolvedCase[] = caseNodes
      .map((c: any) => this.materializeCase(c, site))
      .sort((a: ResolvedCase, b: ResolvedCase) => a.order - b.order || a.id.localeCompare(b.id));
    return { site, cases };
  }

  // ---------- validation ----------
  private validate(raw: any): string[] {
    const errors: string[] = [];
    let resolvedRoot: any;
    try {
      resolvedRoot = this.resolveNode(raw, [], raw);
    } catch (e: any) {
      return [`template resolution failed: ${e.message}`];
    }
    const site = resolvedRoot.site || {};
    if (site.theme && !KNOWN_THEMES.includes(site.theme) && !isPlainObject(site.theme)) {
      errors.push(`site.theme "${site.theme}" is not one of ${KNOWN_THEMES.join(', ')}`);
    }
    if (site.defaultLang && !['en', 'zh'].includes(site.defaultLang)) {
      errors.push('site.defaultLang must be "en" or "zh"');
    }
    if (site.auth && !isPlainObject(site.auth)) {
      errors.push('site.auth must be an object');
    } else if (site.auth) {
      if (site.auth.mode !== undefined && !['open', 'accounts'].includes(site.auth.mode)) {
        errors.push('site.auth.mode must be "open" or "accounts"');
      }
      if (site.auth.accessCode !== undefined && typeof site.auth.accessCode !== 'string') {
        errors.push('site.auth.accessCode must be a string');
      }
    }
    if (site.themeColors && !isPlainObject(site.themeColors)) {
      errors.push('site.themeColors must be an object of CSS variables');
    }
    // ---- template $class validation ----
    const CLASS_KINDS = ['case', 'contentSet', 'questionGroup', 'question'];
    const templates: Record<string, any> = resolvedRoot.templates || {};
    for (const [name, t] of Object.entries(templates)) {
      if (!isPlainObject(t) || t.$class === undefined) continue;
      const cl = `templates.${name}`;
      switch (t.$class) {
        case 'case':
          for (const k of ['content', 'blocks', 'questionGroups', 'questions']) {
            if (t[k] === undefined) continue;
            const v = t[k];
            const ok =
              Array.isArray(v) || (isPlainObject(v) && Array.isArray(v.blocks));
            if (!ok) errors.push(`${cl}.${k} must be an array or a contentSet object`);
          }
          break;
        case 'contentSet':
          if (!Array.isArray(t.blocks) && !(isPlainObject(t.blocks) && Array.isArray(t.blocks.blocks))) {
            errors.push(`${cl}.blocks must be an array of content blocks (or a contentSet reference)`);
          }
          break;
          break;
        case 'questionGroup':
          if (!Array.isArray(t.items)) errors.push(`${cl}.items must be an array`);
          if (t.instruction !== undefined && !isPlainObject(t.instruction)) {
            errors.push(`${cl}.instruction must be an object with "en"/"zh"`);
          }
          if (
            t.references !== undefined &&
            (!Array.isArray(t.references) || t.references.some((r) => typeof r !== 'string'))
          ) {
            errors.push(`${cl}.references must be an array of strings`);
          }
          break;
        case 'question':
          if (!t.key) errors.push(`${cl}.key is required`);
          if (!KNOWN_TYPES.includes(t.type)) errors.push(`${cl}.type "${t.type}" is not one of ${KNOWN_TYPES.join(', ')}`);
          break;
        default:
          errors.push(`${cl}.$class "${t.$class}" is unknown (expected ${CLASS_KINDS.join(' | ')})`);
      }
    }
    const casesNode = resolvedRoot.cases;
    const cases: any[] = Array.isArray(casesNode)
      ? casesNode
      : isPlainObject(casesNode) && Array.isArray(casesNode.blocks)
        ? casesNode.blocks
        : [];
    if (cases.length === 0) {
      errors.push('cases must be a non-empty array (or an object with a blocks array)');
      return errors;
    }
    const ids = new Set<string>();
    cases.forEach((c: any, i: number) => {
      const label = `cases[${i}]`;
      if (c.$class !== undefined && c.$class !== 'case') {
        errors.push(`${label}.$class "${c.$class}" is invalid (expected "case")`);
      }
      if (!c.id || typeof c.id !== 'string' || /[^a-zA-Z0-9_-]/.test(c.id)) {
        errors.push(`${label}.id must match [a-zA-Z0-9_-]`);
        return;
      }
      if (ids.has(c.id)) errors.push(`${label}.id "${c.id}" is duplicated`);
      ids.add(c.id);
      const parts = { content: [] as any[], groups: [] as any[] };
      this.collectCaseParts(c, null, parts, 0);
      parts.content.forEach((b: any, j: number) => {
        const bl = `${label}.content[${j}]`;
        if (!b.key) errors.push(`${bl}.key is required`);
        if (b.style && !KNOWN_STYLES.includes(b.style)) {
          errors.push(`${bl}.style "${b.style}" is not one of ${KNOWN_STYLES.join(', ')}`);
        }
      });
      const qKeys = new Set<string>();
      parts.groups.forEach((g, gi) => {
        if (g.instruction !== undefined && !isPlainObject(g.instruction)) {
          errors.push(`${label}.questions[group ${gi}].instruction must be an object with "en"/"zh"`);
        }
        if (g.references !== undefined) {
          if (!Array.isArray(g.references) || g.references.some((r) => typeof r !== 'string')) {
            errors.push(`${label}.questions[group ${gi}].references must be an array of strings`);
          }
        }
        g.items.forEach((q: any, j: number) => {
          const ql = `${label}.questions[${j}]`;
          if (!q.key || typeof q.key !== 'string' || /[^a-zA-Z0-9_-]/.test(q.key)) {
            errors.push(`${ql}.key must match [a-zA-Z0-9_-]`);
            return;
          }
          if (qKeys.has(q.key)) errors.push(`${ql}.key "${q.key}" is duplicated in case "${c.id}"`);
          qKeys.add(q.key);
          if (!KNOWN_TYPES.includes(q.type)) {
            errors.push(`${ql}.type "${q.type}" is not one of ${KNOWN_TYPES.join(', ')}`);
            return;
          }
          if (CHOICE_TYPES.includes(q.type)) {
            const opts = q.options || [];
            if (opts.length < 2) errors.push(`${ql} (${q.type}) needs at least 2 options`);
            for (const o of opts) {
              if (o.value === undefined) errors.push(`${ql} has an option without value`);
            }
            if (q.type === 'anchor' && opts.some((o: any) => typeof o.value !== 'number')) {
              errors.push(`${ql} (anchor) option values must be numbers`);
            }
          }
          if (q.type === 'number') {
            if (q.min !== undefined && typeof q.min !== 'number') errors.push(`${ql}.min must be a number`);
            if (q.max !== undefined && typeof q.max !== 'number') errors.push(`${ql}.max must be a number`);
            if (typeof q.min === 'number' && typeof q.max === 'number' && q.min > q.max) {
              errors.push(`${ql}.min > max`);
            }
          }
          if (q.appliesIf && !isPlainObject(q.appliesIf)) errors.push(`${ql}.appliesIf must be an object`);
        });
      });
    });
    return errors;
  }

  // ---------- public accessors ----------
  get site(): SiteConfig {
    return this.resolved.site;
  }

  get cases(): ResolvedCase[] {
    return this.resolved.cases;
  }

  activeCases(): ResolvedCase[] {
    return this.cases.filter((c) => c.active);
  }

  caseById(id: string): ResolvedCase | undefined {
    return this.cases.find((c) => c.id === id);
  }

  /** keys of all questions across every case (for CSV export columns) */
  allQuestionKeys(): string[] {
    const out: string[] = [];
    for (const c of this.cases) {
      for (const q of c.questions) {
        if (!out.includes(q.key)) out.push(q.key);
      }
    }
    return out;
  }

  /** keep only known keys; normalize values per question type */
  sanitizeAnswers(c: ResolvedCase, answers: Record<string, any> | undefined | null): Record<string, any> {
    const out: Record<string, any> = {};
    for (const q of c.questions) {
      const v = answers?.[q.key];
      out[q.key] = this.normalizeAnswer(q, v);
    }
    return out;
  }

  normalizeAnswer(q: ResolvedQuestion, v: any): any {
      switch (q.type) {
        case 'anchor':
        case 'singleChoice':
        case 'dropdown': {
          const opts = q.options || [];
          const found = opts.find((o) => o.value === v);
          return found ? found.value : null;
        }
        case 'checkboxes': {
          const opts = q.options || [];
          const valid = new Set(opts.map((o) => o.value));
          if (Array.isArray(v)) return v.filter((x) => valid.has(x));
          return [];
        }
      case 'number': {
        if (typeof v === 'number' && Number.isFinite(v)) {
          if (q.min !== undefined && v < q.min) return null;
          if (q.max !== undefined && v > q.max) return null;
          return v;
        }
        return null;
      }
      case 'yesno': {
        return v === 'yes' || v === 'no' ? v : null;
      }
      case 'text': {
        return typeof v === 'string' ? v.slice(0, 5000) : null;
      }
      default:
        return null;
    }
  }

  /** returns list of unanswered required question keys */
  missingRequired(c: ResolvedCase, answers: Record<string, any>): string[] {
    const missing: string[] = [];
    for (const q of c.questions) {
      if (!q.required) continue;
      const v = answers?.[q.key];
      if (v === null || v === undefined || v === '') missing.push(q.key);
      if (q.type === 'text' && typeof v === 'string' && v.trim() === '') missing.push(q.key);
      if (q.type === 'checkboxes' && Array.isArray(v) && v.length === 0) missing.push(q.key);
    }
    return missing;
  }

  /** count of answered questions for progress display */
  answeredCount(c: ResolvedCase, answers: Record<string, any> | undefined): number {
    if (!answers) return 0;
    return c.questions.filter((q) => {
      const v = this.normalizeAnswer(q, answers[q.key]);
      if (v === null || v === undefined) return false;
      if (q.type === 'text' && String(v).trim() === '') return false;
      if (q.type === 'checkboxes' && Array.isArray(v) && v.length === 0) return false;
      return true;
    }).length;
  }

  // ---------- config editing (admin) ----------
  /** case nodes from either legacy array or the "cases" container object */
  private casesNodes(): any[] {
    return Array.isArray(this.raw.cases)
      ? this.raw.cases
      : isPlainObject(this.raw.cases) && Array.isArray(this.raw.cases.blocks)
        ? this.raw.cases.blocks
        : [];
  }

  setActive(caseId: string, active: boolean): boolean {
    const c = this.casesNodes().find((x: any) => x.id === caseId);
    if (!c) return false;
    c.active = active;
    this.write();
    return true;
  }

  removeCase(caseId: string): boolean {
    const nodes = this.casesNodes();
    const kept = nodes.filter((x: any) => x.id !== caseId);
    if (kept.length === nodes.length) return false;
    if (Array.isArray(this.raw.cases)) this.raw.cases = kept;
    else this.raw.cases.blocks = kept;
    this.write();
    return true;
  }

  /** validate a candidate config; on success write to disk and hot-reload */
  updateConfig(candidate: any): { ok: boolean; errors?: string[] } {
    let errors: string[] = [];
    try {
      errors = this.validate(candidate);
      if (errors.length === 0) {
        const resolved = this.resolveConfig(candidate); // double-check materialization
        if (resolved.cases.length === 0) errors.push('cases must be a non-empty array');
      }
    } catch (e: any) {
      errors = [e.message];
    }
    if (errors.length > 0) return { ok: false, errors };
    fs.writeFileSync(this.configPath, JSON.stringify(candidate, null, 2) + '\n', 'utf-8');
    this.load();
    return { ok: true };
  }

  /** update login mode / shared access code (hot reload) */
  setAuthSettings(mode: 'open' | 'accounts', accessCode: string) {
    this.raw.site ??= {};
    this.raw.site.auth = { mode, accessCode };
    this.write();
  }

  private write() {
    fs.writeFileSync(this.configPath, JSON.stringify(this.raw, null, 2) + '\n', 'utf-8');
    this.load();
  }
}
