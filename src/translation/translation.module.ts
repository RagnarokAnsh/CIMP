import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '../entities';
import { TranslationService } from './translation.service';
import { NoopTranslationService } from './noop-translation.service';
import { LibreTranslateService } from './libretranslate.service';
import { TranslationListener } from './translation.listener';

// Global (like StorageModule/ScanningModule) so any feature can inject
// TranslationService without importing this module. Driver chosen by env;
// 'none' (the default) yields the no-op.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Comment])],
  providers: [
    TranslationListener,
    {
      provide: TranslationService,
      inject: [ConfigService],
      useFactory: (config: ConfigService): TranslationService => {
        const driver = config.get<string>('translation.driver');
        return driver === 'libretranslate'
          ? new LibreTranslateService(config)
          : new NoopTranslationService();
      },
    },
  ],
  exports: [TranslationService],
})
export class TranslationModule {}
