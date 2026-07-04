import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue, IssueLabel, Label } from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { IssueLabelsController, LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({
  imports: [TypeOrmModule.forFeature([Label, IssueLabel, Issue]), AuthModule, AuthzModule],
  controllers: [LabelsController, IssueLabelsController],
  providers: [LabelsService],
})
export class LabelsModule {}
