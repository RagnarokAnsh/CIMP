import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedView } from '../entities';
import { AuthModule } from '../auth/auth.module';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsService } from './saved-views.service';

@Module({
  imports: [TypeOrmModule.forFeature([SavedView]), AuthModule],
  controllers: [SavedViewsController],
  providers: [SavedViewsService],
})
export class SavedViewsModule {}
