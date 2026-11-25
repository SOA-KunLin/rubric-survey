import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rater } from './entities/rater.entity';
import { Rating } from './entities/rating.entity';
import { RubricService } from './rubric/rubric.service';
import { ConfigService } from './config/config.service';
import { SurveyController } from './survey/survey.controller';
import { SurveyService } from './survey/survey.service';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'data/survey.sqlite',
      entities: [Rater, Rating],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Rater, Rating]),
  ],
  controllers: [SurveyController, AdminController],
  providers: [RubricService, ConfigService, SurveyService, AdminService],
})
export class AppModule {}
