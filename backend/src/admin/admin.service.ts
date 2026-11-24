import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as crypto from 'crypto';
import { Rater } from '../entities/rater.entity';
import { EvalCase } from '../entities/eval-case.entity';
import { Rating } from '../entities/rating.entity';
import { RubricService } from '../rubric/rubric.service';

const CSV_HEADERS = [
  'rater_id',
  'rater_name',
  'case_id',
  'case_title',
  'status',
  'submitted_at',
  'updated_at',
];

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Rater) private raters: Repository<Rater>,
    @InjectRepository(EvalCase) private cases: Repository<EvalCase>,
    @InjectRepository(Rating) private ratings: Repository<Rating>,
    private rubric: RubricService,
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
    const [raters, cases, allRatings] = await Promise.all([
      this.raters.find({ order: { createdAt: 'ASC' } }),
      this.cases.find({ order: { order: 'ASC', createdAt: 'ASC' } }),
      this.ratings.find(),
    ]);
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
      const required = this.rubric.dimensionKeys(!!c.responseB).length;
      const rows = allRatings.filter((r) => r.caseId === c.id);
      const submitted = rows.filter((r) => r.status === 'submitted').length;
      const drafts = rows.filter((r) => r.status === 'draft').length;
      return { id: c.id, title: c.title, titleZh: c.titleZh, order: c.order, active: c.active, hasResponseB: !!c.responseB, requiredDimensions: required, submitted, drafts };
    });

    return {
      rubricVersion: this.rubric.rubric.version,
      totals: {
        raters: raters.length,
        cases: cases.length,
        submitted: allRatings.filter((r) => r.status === 'submitted').length,
        drafts: allRatings.filter((r) => r.status === 'draft').length,
        expected: raters.length * cases.length,
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
  private static describe(values: number[]) {
    const n = values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const mean = n ? values.reduce((a, b) => a + b, 0) / n : null;
    const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean!) ** 2, 0) / (n - 1)) : n === 1 ? 0 : null;
    const median = n
      ? n % 2
        ? sorted[(n - 1) / 2]
        : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : null;
    return { n, mean, sd, median, min: n ? sorted[0] : null, max: n ? sorted[n - 1] : null };
  }

  async stats() {
    const cases = await this.cases.find({ order: { order: 'ASC' } });
    const ratings = await this.ratings.find({ where: { status: 'submitted' } });
    const allRatings = await this.ratings.find();

    const perCase = cases.map((c) => {
      const rows = ratings.filter((r) => r.caseId === c.id);
      const dims: Record<string, any> = {};
      for (const d of this.rubric.requiredDimensions(!!c.responseB)) {
        const values = rows.map((r) => r.scores?.[d.key]).filter((v): v is number => typeof v === 'number');
        const dist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
        for (const v of values) dist[String(v)] += 1;
        dims[d.key] = { ...AdminService.describe(values), dist, values };
      }
      const overall = AdminService.describe(
        rows.map((r) => {
          const vs = this.rubric.requiredDimensions(!!c.responseB)
            .map((d) => r.scores?.[d.key])
            .filter((v): v is number => typeof v === 'number');
          return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
        }).filter((v): v is number => v !== null),
      );
      return { caseId: c.id, title: c.title, titleZh: c.titleZh, ratersSubmitted: rows.length, dimensions: dims, overall };
    });

    // per rater stats
    const raters = await this.raters.find();
    const perRater = raters.map((rt) => {
      const rows = ratings.filter((r) => r.raterId === rt.id);
      const perRowMeans = rows
        .map((r) => {
          const c = cases.find((cc) => cc.id === r.caseId);
          if (!c) return null;
          const vs = this.rubric.requiredDimensions(!!c.responseB)
            .map((d) => r.scores?.[d.key])
            .filter((v): v is number => typeof v === 'number');
          return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
        })
        .filter((v): v is number => v !== null);
      return {
        raterId: rt.id,
        name: rt.name,
        submitted: rows.length,
        drafts: allRatings.filter((r) => r.raterId === rt.id && r.status === 'draft').length,
        meanOverall: AdminService.describe(perRowMeans).mean,
      };
    });

    // overall per dimension across all cases
    const perDimension: Record<string, any> = {};
    for (const d of this.rubric.dimensions) {
      const values: number[] = [];
      for (const r of ratings) {
        const c = cases.find((cc) => cc.id === r.caseId);
        if (!c) continue;
        if (!this.rubric.requiredDimensions(!!c.responseB).some((dd) => dd.key === d.key)) continue;
        const v = r.scores?.[d.key];
        if (typeof v === 'number') values.push(v);
      }
      perDimension[d.key] = AdminService.describe(values);
    }

    return { perCase, perRater, perDimension };
  }

  // ---------- export ----------
  async exportCsv() {
    const [rows, raters, cases] = await Promise.all([
      this.ratings.find({ order: { updatedAt: 'ASC' } }),
      this.raters.find(),
      this.cases.find(),
    ]);
    const nameMap = new Map(raters.map((r) => [r.id, r.name]));
    const caseMap = new Map(cases.map((c) => [c.id, c]));
    const dimKeys = this.rubric.dimensions.map((d) => d.key);
    const headers = [...CSV_HEADERS, ...dimKeys, 'notes'];
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
        c ? c.title : '',
        r.status,
        r.submittedAt || '',
        r.updatedAt,
        ...dimKeys.map((k) => (r.scores?.[k] ?? '')),
        r.notes,
      ]
        .map(esc)
        .join(',');
      lines.push(line);
    }
    return '\uFEFF' + lines.join('\r\n');
  }

  // ---------- case management ----------
  async upsertCase(dto: any) {
    const id = String(dto.id || '').trim();
    if (!id || /[^a-zA-Z0-9_-]/.test(id)) {
      throw new UnauthorizedException('Case id must be [a-zA-Z0-9_-]');
    }
    let c = await this.cases.findOne({ where: { id } });
    if (!c) {
      c = this.cases.create();
    }
    Object.assign(c, { ...dto, id });
    if (c.responseB === undefined) c.responseB = null;
    if (c.conversation === undefined) c.conversation = null;
    return this.cases.save(c);
  }

  async patchCase(id: string, dto: { active?: boolean; order?: number }) {
    const c = await this.cases.findOne({ where: { id } });
    if (!c) throw new UnauthorizedException('Case not found');
    if (typeof dto.active === 'boolean') c.active = dto.active;
    if (typeof dto.order === 'number') c.order = dto.order;
    return this.cases.save(c);
  }

  async deleteCase(id: string) {
    await this.ratings.delete({ caseId: id });
    await this.cases.delete(id);
    return { ok: true };
  }
}
