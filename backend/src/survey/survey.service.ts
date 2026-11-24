import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rater } from '../entities/rater.entity';
import { EvalCase } from '../entities/eval-case.entity';
import { Rating } from '../entities/rating.entity';
import { RubricService } from '../rubric/rubric.service';

@Injectable()
export class SurveyService {
  constructor(
    @InjectRepository(Rater) private raters: Repository<Rater>,
    @InjectRepository(EvalCase) private cases: Repository<EvalCase>,
    @InjectRepository(Rating) private ratings: Repository<Rating>,
    private rubric: RubricService,
  ) {}

  private now() {
    return new Date().toISOString();
  }

  async touch(rater: Rater) {
    rater.lastSeenAt = this.now();
    await this.raters.save(rater);
  }

  async authRater(name: string, accessCode: string): Promise<Rater> {
    const expected = process.env.SURVEY_ACCESS_CODE || 'eval2026';
    if (accessCode !== expected) {
      throw new UnauthorizedException('Invalid access code');
    }
    const clean = name.trim();
    let rater = await this.raters.findOne({ where: { name: clean } });
    if (!rater) {
      rater = this.raters.create({ name: clean, lastSeenAt: this.now() });
      await this.raters.save(rater);
    } else {
      await this.touch(rater);
    }
    return rater;
  }

  async raterByToken(token: string): Promise<Rater> {
    if (!token) throw new UnauthorizedException('Missing token');
    const rater = await this.raters.findOne({ where: { id: token } });
    if (!rater) throw new UnauthorizedException('Unknown rater token');
    await this.touch(rater);
    return rater;
  }

  async listCasesForRater(raterId: string) {
    const cases = await this.cases.find({ where: { active: true }, order: { order: 'ASC', createdAt: 'ASC' } });
    const mine = await this.ratings.find({ where: { raterId } });
    const byCase = new Map(mine.map((r) => [r.caseId, r]));
    return cases.map((c) => {
      const r = byCase.get(c.id);
      const required = this.rubric.dimensionKeys(!!c.responseB).length;
      const answered = r ? Object.values(r.scores || {}).filter((v) => typeof v === 'number' && v >= 1).length : 0;
      return {
        ...c,
        myStatus: r ? r.status : 'not-started',
        myUpdatedAt: r ? r.updatedAt : null,
        mySubmittedAt: r ? r.submittedAt : null,
        requiredDimensions: required,
        answeredDimensions: Math.min(answered, required),
      };
    });
  }

  async getRating(raterId: string, caseId: string): Promise<Rating | null> {
    return this.ratings.findOne({ where: { raterId, caseId } });
  }

  async assertCase(caseId: string): Promise<EvalCase> {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  async saveDraft(raterId: string, caseId: string, scores: Record<string, number | null>, notes: string, allowRetract = false) {
    const c = await this.assertCase(caseId);
    let rating = await this.getRating(raterId, caseId);
    if (!rating) {
      rating = this.ratings.create({ raterId, caseId, scores: {}, notes: '' });
    }
    if (rating.status === 'submitted' && !allowRetract) {
      throw new BadRequestException('Already submitted; retract first to edit');
    }
    rating.scores = this.sanitizeScores(scores);
    if (typeof notes === 'string') rating.notes = notes.slice(0, 5000);
    rating.status = 'draft';
    rating.submittedAt = null;
    return this.ratings.save(rating);
  }

  async submit(raterId: string, caseId: string, scores: Record<string, number | null> | undefined, notes: string | undefined) {
    const c = await this.assertCase(caseId);
    let rating = await this.getRating(raterId, caseId);
    if (!rating) {
      rating = this.ratings.create({ raterId, caseId, scores: {}, notes: '' });
    }
    if (scores) rating.scores = this.sanitizeScores(scores);
    if (typeof notes === 'string') rating.notes = notes.slice(0, 5000);
    const missing = this.rubric.validateScores(rating.scores, !!c.responseB);
    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'Missing or invalid scores',
        missing,
      });
    }
    rating.status = 'submitted';
    rating.submittedAt = this.now();
    return this.ratings.save(rating);
  }

  async retract(raterId: string, caseId: string) {
    const rating = await this.getRating(raterId, caseId);
    if (!rating || rating.status !== 'submitted') {
      throw new BadRequestException('No submitted rating to retract');
    }
    rating.status = 'draft';
    rating.submittedAt = null;
    return this.ratings.save(rating);
  }

  private sanitizeScores(scores: Record<string, any> | undefined | null): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    const keys = this.rubric.dimensions.map((d) => d.key);
    for (const k of keys) {
      const v = scores?.[k];
      out[k] = typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
    }
    return out;
  }
}
