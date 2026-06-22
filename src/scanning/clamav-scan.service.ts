import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Socket } from 'net';
import { ScanStatus } from '../common/enums';
import { ScanService } from './scan.service';

// Production scanner: streams bytes to a ClamAV daemon (clamd) over TCP using the
// INSTREAM command and maps the verdict to a ScanStatus. Configure with
// CLAMAV_HOST / CLAMAV_PORT (default localhost:3310). On any connection/timeout
// error the file is left PENDING (never silently treated as clean), so it stays
// un-servable until a later successful scan.
@Injectable()
export class ClamavScanService extends ScanService {
  private readonly logger = new Logger(ClamavScanService.name);
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    super();
    this.host = config.get<string>('scan.clamav.host') ?? '127.0.0.1';
    this.port = config.get<number>('scan.clamav.port') ?? 3310;
    this.timeoutMs = config.get<number>('scan.clamav.timeoutMs') ?? 30_000;
  }

  async scan(buffer: Buffer, filename: string): Promise<ScanStatus> {
    try {
      const reply = await this.instream(buffer);
      if (/\bOK\b/.test(reply) && !/FOUND/.test(reply)) return ScanStatus.CLEAN;
      if (/FOUND/.test(reply)) {
        this.logger.warn(`ClamAV flagged ${filename}: ${reply.trim()}`);
        return ScanStatus.INFECTED;
      }
      this.logger.error(`Unexpected ClamAV reply for ${filename}: ${reply.trim()}`);
      return ScanStatus.PENDING;
    } catch (err) {
      this.logger.error(`ClamAV scan error for ${filename}: ${(err as Error).message}`);
      return ScanStatus.PENDING;
    }
  }

  // clamd INSTREAM protocol: send `zINSTREAM\0`, then a series of
  // <4-byte big-endian length><chunk> frames, terminated by a zero-length frame.
  private instream(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket: Socket = connect(this.port, this.host);
      const chunks: Buffer[] = [];
      let settled = false;

      const done = (err: Error | null, reply?: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(err);
        else resolve(reply ?? '');
      };

      socket.setTimeout(this.timeoutMs, () => done(new Error('clamd timeout')));
      socket.on('error', (e) => done(e));
      socket.on('data', (d) => chunks.push(d));
      socket.on('end', () => done(null, Buffer.concat(chunks).toString('utf8')));

      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        const CHUNK = 64 * 1024;
        for (let i = 0; i < buffer.length; i += CHUNK) {
          const slice = buffer.subarray(i, i + CHUNK);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(slice.length, 0);
          socket.write(len);
          socket.write(slice);
        }
        const terminator = Buffer.alloc(4);
        terminator.writeUInt32BE(0, 0);
        socket.write(terminator);
      });
    });
  }
}
