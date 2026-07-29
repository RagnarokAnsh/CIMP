import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { StorageService, StoredObject } from './storage.service';

@Injectable()
export class LocalDiskStorageService extends StorageService {
  private readonly dir: string;

  constructor(config: ConfigService) {
    super();
    this.dir = config.get<string>('storage.dir') ?? './uploads';
  }

  async save(buffer: Buffer, originalName: string, _contentType: string): Promise<StoredObject> {
    await fs.mkdir(this.dir, { recursive: true });
    const safeExt = extname(originalName).slice(0, 12);
    const storageKey = `${randomUUID()}${safeExt}`;
    await fs.writeFile(join(this.dir, storageKey), buffer);
    return { storageKey };
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFile(join(this.dir, storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await fs.unlink(join(this.dir, storageKey));
    } catch (err) {
      // Already gone is the outcome we wanted, so ENOENT is not an error here —
      // only a genuine I/O failure is worth surfacing.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
