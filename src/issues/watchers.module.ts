import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue, IssueWatcher } from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { WatchersController } from './watchers.controller';
import { WatchersService } from './watchers.service';

@Module({
  imports: [TypeOrmModule.forFeature([IssueWatcher, Issue]), AuthModule, AuthzModule],
  controllers: [WatchersController],
  providers: [WatchersService],
})
export class WatchersModule {}
