import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rater } from './entities/rater.entity';
import { EvalCase } from './entities/eval-case.entity';
import { Rating } from './entities/rating.entity';
import { RubricService } from './rubric/rubric.service';
import { SurveyController } from './survey/survey.controller';
import { SurveyService } from './survey/survey.service';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { SeedService } from './seed/seed.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'data/survey.sqlite',
      entities: [Rater, EvalCase, Rating],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Rater, EvalCase, Rating]),
  ],
  controllers: [SurveyController, AdminController],
  providers: [RubricService, SurveyService, AdminService, SeedService],
})
export class AppModule {}
