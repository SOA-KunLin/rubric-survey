import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { AuthRaterDto } from '../dto/auth.dto';
import { SaveDraftDto, SubmitDto } from '../dto/survey.dto';
import { Rater } from '../entities/rater.entity';

async function currentRater(service: SurveyService, token: string): Promise<Rater> {
  return service.raterByToken(token);
}

@Controller('survey')
export class SurveyController {
  constructor(private readonly service: SurveyService) {}

  @Post('auth')
  auth(@Body() dto: AuthRaterDto) {
    return this.service.authRater(dto.name, dto.accessCode).then((r) => ({ token: r.id, name: r.name, id: r.id }));
  }

  @Get('cases')
  async cases(@Query('token') token: string) {
    const rater = await currentRater(this.service, token);
    return { rater: { id: rater.id, name: rater.name }, cases: await this.service.listCasesForRater(rater.id) };
  }

  @Get('rating/:caseId')
  async rating(@Param('caseId') caseId: string, @Query('token') token: string) {
    const rater = await currentRater(this.service, token);
    await this.service.assertCase(caseId);
    return { rating: await this.service.getRating(rater.id, caseId) };
  }

  @Put('rating/:caseId/draft')
  async saveDraft(@Param('caseId') caseId: string, @Query('token') token: string, @Body() dto: SaveDraftDto) {
    const rater = await currentRater(this.service, token);
    const rating = await this.service.saveDraft(rater.id, caseId, dto.scores || {}, dto.notes ?? '', true);
    return { ok: true, updatedAt: rating.updatedAt, status: rating.status };
  }

  @Post('rating/:caseId/submit')
  async submit(@Param('caseId') caseId: string, @Query('token') token: string, @Body() dto: SubmitDto) {
    const rater = await currentRater(this.service, token);
    const rating = await this.service.submit(rater.id, caseId, dto.scores, dto.notes);
    return { ok: true, status: rating.status, submittedAt: rating.submittedAt };
  }

  @Post('rating/:caseId/retract')
  async retract(@Param('caseId') caseId: string, @Query('token') token: string) {
    const rater = await currentRater(this.service, token);
    await this.service.retract(rater.id, caseId);
    return { ok: true, status: 'draft' };
  }
}
