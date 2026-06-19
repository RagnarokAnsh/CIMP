import { Injectable } from '@nestjs/common';
import { ScanStatus } from '../common/enums';
import { ScanService } from './scan.service';

// Dev/default scanner: marks files SKIPPED (scanning not configured). Replace
// with a ClamAV-backed implementation in production by binding it in
// ScanningModule.
@Injectable()
export class NoopScanService extends ScanService {
  async scan(): Promise<ScanStatus> {
    return ScanStatus.SKIPPED;
  }
}
