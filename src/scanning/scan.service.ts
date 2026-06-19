import { ScanStatus } from '../common/enums';

// Malware-scanning seam. The production implementation streams the bytes to a
// scanner (e.g. ClamAV) and returns CLEAN or INFECTED. Attachments stay PENDING
// until scanned; only CLEAN/SKIPPED files are served.
export abstract class ScanService {
  abstract scan(buffer: Buffer, filename: string): Promise<ScanStatus>;
}
