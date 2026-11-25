import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rater } from '../entities/rater.entity';
import { Rating } from '../entities/rating.entity';
import { ConfigService, ResolvedCase } from '../config/config.service';

@Injectable()
export class SurveyService {
  constructor(
    @InjectRepository(Rater) private raters: Repository<Rater>,
    @InjectRepository(Rating) private ratings: Repository<Rating>,
    private config: ConfigService,
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
    const cases = this.config.activeCases();
    const mine = await this.ratings.find({ where: { raterId } });
    const byCase = new Map(mine.map((r) => [r.caseId, r]));
    return cases.map((c) => {
      const r = byCase.get(c.id);
      return {
        ...c,
        myStatus: r ? r.status : 'not-started',
        myUpdatedAt: r ? r.updatedAt : null,
        mySubmittedAt: r ? r.submittedAt : null,
        answeredCount: r ? this.config.answeredCount(c, r.scores) : 0,
      };
    });
  }

  async getRating(raterId: string, caseId: string): Promise<Rating | null> {
    return this.ratings.findOne({ where: { raterId, caseId } });
  }

  assertCase(caseId: string): ResolvedCase {
    const c = this.config.caseById(caseId);
    if (!c || !c.active) throw new NotFoundException('Case not found');
    return c;
  }

  async saveDraft(raterId: string, caseId: string, answers: Record<string, any>, notes: string) {
    const c = this.assertCase(caseId);
    let rating = await this.getRating(raterId, caseId);
    if (!rating) {
      rating = this.ratings.create({ raterId, caseId, scores: {}, notes: '' });
    }
    rating.scores = this.config.sanitizeAnswers(c, answers);
    if (typeof notes === 'string') rating.notes = notes.slice(0, 5000);
    rating.status = 'draft';
    rating.submittedAt = null;
    return this.ratings.save(rating);
  }

  async submit(raterId: string, caseId: string, answers: Record<string, any> | undefined, notes: string | undefined) {
    const c = this.assertCase(caseId);
    let rating = await this.getRating(raterId, caseId);
    if (!rating) {
      rating = this.ratings.create({ raterId, caseId, scores: {}, notes: '' });
    }
    if (answers) rating.scores = this.config.sanitizeAnswers(c, answers);
    if (typeof notes === 'string') rating.notes = notes.slice(0, 5000);
    const missing = this.config.missingRequired(c, rating.scores);
    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'Missing required answers',
        missing,
      });
    }
    rating.status = 'submitted';
    rating.submittedAt = this.now();
    return this.ratings.save(rating);
  }

  /** draft save that also retracts a submitted rating (used by the auto-save path) */
  async saveDraftAllowRetract(raterId: string, caseId: string, answers: Record<string, any>, notes: string) {
    const c = this.assertCase(caseId);
    const existing = await this.getRating(raterId, caseId);
    if (existing?.status === 'submitted') {
      existing.status = 'draft';
      existing.submittedAt = null;
      await this.ratings.save(existing);
    }
    return this.saveDraft(raterId, caseId, answers, notes);
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
}
