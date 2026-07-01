import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Platform } from '../entities';
import { AuthModule } from '../auth/auth.module';
import { SelfSupportController } from './self-support.controller';
import { SelfSupportService } from './self-support.service';

@Module({
  imports: [TypeOrmModule.forFeature([Platform]), AuthModule],
  controllers: [SelfSupportController],
  providers: [SelfSupportService],
})
export class SelfSupportModule {}
