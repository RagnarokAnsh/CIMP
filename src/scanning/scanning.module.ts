import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from '../entities';
import { ScanService } from './scan.service';
import { NoopScanService } from './noop-scan.service';
import { ScanningListener } from './scanning.listener';

// Global so the ScanService seam is injectable anywhere (e.g. attachment
// serving checks). Swap NoopScanService for a ClamAV implementation in prod.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Attachment])],
  providers: [
    { provide: ScanService, useClass: NoopScanService },
    ScanningListener,
  ],
  exports: [ScanService],
})
export class ScanningModule {}
