import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment, CsatResponse, Issue, Reporter } from '../entities';
import { HandoffModule } from '../handoff/handoff.module';
import { CsatController } from './csat.controller';
import { CsatService } from './csat.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CsatResponse, Issue, Reporter, Comment]),
    HandoffModule,
  ],
  controllers: [CsatController],
  providers: [CsatService],
})
export class CsatModule {}
