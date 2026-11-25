import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { IsBoolean, IsObject } from 'class-validator';
import { Request, Response } from 'express';
import { AdminService } from './admin.service';
import { AdminLoginDto } from '../dto/auth.dto';

function tokenFrom(req: Request): string | undefined {
  return (req.headers['x-admin-token'] as string) || undefined;
}

class SetActiveDto {
  @IsBoolean()
  active!: boolean;
}

class UpdateConfigDto {
  @IsObject()
  config!: any;
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

  // ---------- survey config ----------
  @Get('config')
  getConfig(@Req() req: Request) {
    this.service.verifyAdmin(tokenFrom(req));
    return this.service.getConfig();
  }

  @Put('config')
  updateConfig(@Req() req: Request, @Body() dto: UpdateConfigDto) {
    this.service.verifyAdmin(tokenFrom(req));
    const res = this.service.updateConfig(dto.config);
    if (!res.ok) {
      throw new HttpException({ message: 'Invalid survey config', errors: res.errors }, 400);
    }
    return { ok: true, cases: this.service.getConfig().resolved.cases.length };
  }

  @Patch('cases/:id')
  async patchCase(@Req() req: Request, @Param('id') id: string, @Body() dto: SetActiveDto) {
    this.service.verifyAdmin(tokenFrom(req));
    return this.service.setActive(id, !!dto.active);
  }

  @Delete('cases/:id')
  async deleteCase(@Req() req: Request, @Param('id') id: string) {
    this.service.verifyAdmin(tokenFrom(req));
    return this.service.removeCase(id);
  }
}
