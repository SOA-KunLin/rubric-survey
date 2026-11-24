import { BadRequestException, Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AdminService } from './admin.service';
import { AdminLoginDto } from '../dto/auth.dto';
import { PatchCaseDto, UpsertCaseDto } from '../dto/case.dto';

function tokenFrom(req: Request): string | undefined {
  return (req.headers['x-admin-token'] as string) || undefined;
}

@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.service.login(dto.password);
  }

  @Get('overview')
  async overview(@Req() req: Request) {
    this.service.verifyAdmin(tokenFrom(req));
    return this.service.overview();
  }

  @Get('ratings')
  async ratings(@Req() req: Request, @Query() q: { caseId?: string; raterId?: string; status?: string }) {
    this.service.verifyAdmin(tokenFrom(req));
    return this.service.listRatings(q);
  }

  @Get('stats')
  async stats(@Req() req: Request) {
    this.service.verifyAdmin(tokenFrom(req));
    return this.service.stats();
  }

  @Get('export')
  async export(@Req() req: Request, @Res() res: Response) {
    this.service.verifyAdmin(tokenFrom(req));
    const csv = await this.service.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ratings-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Post('cases')
  async createCase(@Req() req: Request, @Body() dto: UpsertCaseDto) {
    this.service.verifyAdmin(tokenFrom(req));
    return this.service.upsertCase(dto);
  }

  @Patch('cases/:id')
  async patchCase(@Req() req: Request, @Param('id') id: string, @Body() dto: PatchCaseDto) {
    this.service.verifyAdmin(tokenFrom(req));
    return this.service.patchCase(id, dto);
  }

  @Delete('cases/:id')
  async deleteCase(@Req() req: Request, @Param('id') id: string) {
    this.service.verifyAdmin(tokenFrom(req));
    return this.service.deleteCase(id);
  }
}
