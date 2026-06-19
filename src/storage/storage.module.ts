import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { LocalDiskStorageService } from './local-disk-storage.service';
import { S3StorageService } from './s3-storage.service';

// Selects the storage backend from STORAGE_DRIVER ('local' | 's3'). Callers
// depend only on the abstract StorageService.
@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('storage.driver') === 's3'
          ? new S3StorageService(config)
          : new LocalDiskStorageService(config),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
