import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as crypto from 'crypto';
import { Rater } from '../entities/rater.entity';
import { Rating } from '../entities/rating.entity';
import { ConfigService, ResolvedCase, ResolvedQuestion } from '../config/config.service';

interface Described {
  n: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

function describe(values: number[]): Described {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : null;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean!) ** 2, 0) / (n - 1)) : n === 1 ? 0 : null;
  const median = n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : null;
  return { n, mean, sd, median, min: n ? sorted[0] : null, max: n ? sorted[n - 1] : null };
}

function isNumericQ(q: ResolvedQuestion): boolean {
  return (
    q.type === 'anchor' ||
    ((q.type === 'singleChoice' || q.type === 'dropdown') &&
      (q.options || []).every((o) => typeof o.value === 'number'))
  );
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Rater) private raters: Repository<Rater>,
    @InjectRepository(Rating) private ratings: Repository<Rating>,
    private config: ConfigService,
  ) {}

  // ---------- auth ----------
  login(password: string) {
    const expected = process.env.ADMIN_PASSWORD || 'admin123';
    if (password !== expected) throw new UnauthorizedException('Wrong admin password');
    const exp = Date.now() + 12 * 3600 * 1000;
    const payload = `admin.${exp}`;
    const secret = process.env.ADMIN_SECRET || 'dev-secret-change-me';
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return { token: `${payload}.${sig}`, expiresIn: 12 * 3600 };
  }

  verifyAdmin(token: string | undefined) {
    if (!token) throw new UnauthorizedException('Missing admin token');
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Malformed admin token');
    const [scope, exp, sig] = parts;
    if (scope !== 'admin') throw new UnauthorizedException('Bad token');
    if (Number(exp) < Date.now()) throw new UnauthorizedException('Admin token expired');
    const secret = process.env.ADMIN_SECRET || 'dev-secret-change-me';
    const expected = crypto.createHmac('sha256', secret).update(`${scope}.${exp}`).digest('hex');
    if (sig !== expected) throw new UnauthorizedException('Invalid admin token');
  }

  // ---------- overview ----------
  async overview() {
    const [raters, allRatings] = await Promise.all([
      this.raters.find({ order: { createdAt: 'ASC' } }),
      this.ratings.find(),
    ]);
    const cases = this.config.cases;
    const activeCases = cases.filter((c) => c.active);
    const byRaterCase = new Map<string, Rating>();
    for (const r of allRatings) byRaterCase.set(`${r.raterId}|${r.caseId}`, r);

    const matrix: Record<string, Record<string, string>> = {};
    const raterSummaries = raters.map((rt) => {
      const mine = allRatings.filter((r) => r.raterId === rt.id);
      const submitted = mine.filter((r) => r.status === 'submitted').length;
      const drafts = mine.filter((r) => r.status === 'draft').length;
      const lastActivity = mine.reduce<string | null>(
        (acc, r) => (!acc || r.updatedAt > acc ? r.updatedAt : acc),
        rt.lastSeenAt || null,
      );
      matrix[rt.id] = {};
      return { ...rt, submitted, drafts, lastActivity };
    });
    for (const rt of raters) {
      for (const c of cases) {
        const r = byRaterCase.get(`${rt.id}|${c.id}`);
        matrix[rt.id][c.id] = r ? r.status : 'not-started';
      }
    }

    const caseSummaries = cases.map((c) => {
      const rows = allRatings.filter((r) => r.caseId === c.id);
      return {
        id: c.id,
        title: c.title,
        order: c.order,
        active: c.active,
        hasResponseB: !!c.data.responseB,
        requiredQuestions: c.requiredCount,
        submitted: rows.filter((r) => r.status === 'submitted').length,
        drafts: rows.filter((r) => r.status === 'draft').length,
      };
    });

    return {
      rubricVersion: this.config.raw.site?.version || 'config-driven',
      totals: {
        raters: raters.length,
        cases: cases.length,
        activeCases: activeCases.length,
        submitted: allRatings.filter((r) => r.status === 'submitted').length,
        drafts: allRatings.filter((r) => r.status === 'draft').length,
        expected: raters.length * activeCases.length,
      },
      raters: raterSummaries,
      cases: caseSummaries,
      matrix,
    };
  }

  async listRatings(opts: { caseId?: string; raterId?: string; status?: string }) {
    const where: any = {};
    if (opts.caseId) where.caseId = opts.caseId;
    if (opts.raterId) where.raterId = opts.raterId;
    if (opts.status) where.status = opts.status;
    const rows = await this.ratings.find({ where, order: { updatedAt: 'DESC' } });
    const raterIds = [...new Set(rows.map((r) => r.raterId))];
    const raters = raterIds.length ? await this.raters.find({ where: { id: In(raterIds) } }) : [];
    const nameMap = new Map(raters.map((r) => [r.id, r.name]));
    return rows.map((r) => ({ ...r, raterName: nameMap.get(r.raterId) || r.raterId }));
  }

  // ---------- stats ----------
  private questionStats(q: ResolvedQuestion, rows: Rating[]) {
    const raw = rows.map((r) => r.scores?.[q.key]).filter((v) => v !== null && v !== undefined && v !== '');
    const counts: Record<string, number> = {};

    // multi-select: tally each selected option; a row counts once if any selection
    if (q.type === 'checkboxes') {
      let n = 0;
      for (const v of raw) {
        const clean = this.config.normalizeAnswer(q, Array.isArray(v) ? v : []);
        if (Array.isArray(clean) && clean.length > 0) {
          n += 1;
          for (const x of clean) counts[String(x)] = (counts[String(x)] || 0) + 1;
        }
      }
      return { key: q.key, type: q.type, names: q.names, required: q.required, n, counts, values: [] as number[] };
    }

    const normalized = raw.map((v) => this.config.normalizeAnswer(q, v)).filter((v) => v !== null);
    for (const v of normalized) counts[String(v)] = (counts[String(v)] || 0) + 1;
    const numeric = isNumericQ(q) ? (normalized as number[]) : [];
    return {
      key: q.key,
      type: q.type,
      names: q.names,
      required: q.required,
      n: normalized.length,
      counts,
      ...(isNumericQ(q) ? describe(numeric) : {}),
      values: numeric,
    };
  }

  private caseOverall(c: ResolvedCase, rows: Rating[]): Described {
    const perRowMeans = rows
      .map((r) => {
        const vs = c.questions
          .filter((q) => isNumericQ(q))
          .map((q) => r.scores?.[q.key])
          .filter((v) => typeof v === 'number') as number[];
        return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
      })
      .filter((v): v is number => v !== null);
    return describe(perRowMeans);
  }

  async stats() {
    const cases = this.config.cases;
    const submitted = await this.ratings.find({ where: { status: 'submitted' } });
    const allRatings = await this.ratings.find();

    const perCase = cases.map((c) => {
      const rows = submitted.filter((r) => r.caseId === c.id);
      const dims: Record<string, any> = {};
      for (const q of c.questions) dims[q.key] = this.questionStats(q, rows);
      return {
        caseId: c.id,
        title: c.title,
        ratersSubmitted: rows.length,
        questions: dims,
        overall: this.caseOverall(c, rows),
      };
    });

    const raters = await this.raters.find();
    const perRater = raters.map((rt) => {
      const rows = submitted.filter((r) => r.raterId === rt.id);
      const perRowMeans = rows
        .map((r) => {
          const c = cases.find((cc) => cc.id === r.caseId);
          if (!c) return null;
          const vs = c.questions
            .filter((q) => isNumericQ(q))
            .map((q) => r.scores?.[q.key])
            .filter((v) => typeof v === 'number') as number[];
          return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
        })
        .filter((v): v is number => v !== null);
      return {
        raterId: rt.id,
        name: rt.name,
        submitted: rows.length,
        drafts: allRatings.filter((r) => r.raterId === rt.id && r.status === 'draft').length,
        meanOverall: describe(perRowMeans).mean,
      };
    });

    // overall per question key across cases that include it
    const perQuestion: Record<string, any> = {};
    for (const key of this.config.allQuestionKeys()) {
      const values: number[] = [];
      for (const r of submitted) {
        const c = cases.find((cc) => cc.id === r.caseId);
        const q = c?.questions.find((qq) => qq.key === key);
        if (!q || !isNumericQ(q)) continue;
        const v = r.scores?.[key];
        if (typeof v === 'number') values.push(v);
      }
      perQuestion[key] = describe(values);
    }

    return { perCase, perRater, perQuestion };
  }

  // ---------- export ----------
  async exportCsv() {
    const [rows, raters] = await Promise.all([
      this.ratings.find({ order: { updatedAt: 'ASC' } }),
      this.raters.find(),
    ]);
    const cases = this.config.cases;
    const nameMap = new Map(raters.map((r) => [r.id, r.name]));
    const caseMap = new Map(cases.map((c) => [c.id, c]));
    const qKeys = this.config.allQuestionKeys();
    const headers = ['rater_id', 'rater_name', 'case_id', 'case_title', 'status', 'submitted_at', 'updated_at', ...qKeys, 'notes'];
    const esc = (s: any) => {
      const str = s === null || s === undefined ? '' : String(s);
      return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      const c = caseMap.get(r.caseId);
      const line = [
        r.raterId,
        nameMap.get(r.raterId) || '',
        r.caseId,
        c ? c.title.en : '',
        r.status,
        r.submittedAt || '',
        r.updatedAt,
        ...qKeys.map((k) => (r.scores?.[k] ?? '')),
        r.notes,
      ]
        .map(esc)
        .join(',');
      lines.push(line);
    }
    return '\uFEFF' + lines.join('\r\n');
  }

  // ---------- config management ----------
  getConfig() {
    return { raw: this.config.raw, resolved: this.config.resolved };
  }

  updateConfig(candidate: any) {
    return this.config.updateConfig(candidate);
  }

  setActive(caseId: string, active: boolean) {
    const ok = this.config.setActive(caseId, active);
    if (!ok) throw new UnauthorizedException('Case not found');
    return { ok: true };
  }

  removeCase(caseId: string) {
    const ok = this.config.removeCase(caseId);
    if (!ok) throw new UnauthorizedException('Case not found');
    return { ok: true };
  }
}
