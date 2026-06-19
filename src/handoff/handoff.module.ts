import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Platform } from '../entities';
import { HandoffService } from './handoff.service';
import { HandoffGuard } from './handoff.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Platform])],
  providers: [HandoffService, HandoffGuard],
  exports: [HandoffService, HandoffGuard],
})
export class HandoffModule {}
