import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from '../entities';
import { ScanService } from './scan.service';
import { NoopScanService } from './noop-scan.service';
import { ClamavScanService } from './clamav-scan.service';
import { ScanningListener } from './scanning.listener';

// Global so the ScanService seam is injectable anywhere (e.g. attachment
// serving checks). Driver chosen by SCAN_DRIVER: 'clamav' for the real scanner,
// otherwise the no-op (marks files SKIPPED). The env validator warns/fails when
// the no-op is used in production.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Attachment])],
  providers: [
    {
      provide: ScanService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('scan.driver') === 'clamav'
          ? new ClamavScanService(config)
          : new NoopScanService(),
    },
    ScanningListener,
  ],
  exports: [ScanService],
})
export class ScanningModule {}
