import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment, CsatResponse, Issue, Reporter, ReporterIssueView } from '../entities';
import { HandoffModule } from '../handoff/handoff.module';
import { ReporterController } from './reporter.controller';
import { ReporterService } from './reporter.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reporter, Issue, ReporterIssueView, Attachment, CsatResponse]),
    HandoffModule,
  ],
  controllers: [ReporterController],
  providers: [ReporterService],
})
export class ReporterModule {}
