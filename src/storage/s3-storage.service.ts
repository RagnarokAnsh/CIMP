import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { StorageService, StoredObject } from './storage.service';

// S3/MinIO-backed storage. Bound via STORAGE_DRIVER=s3. Files never touch the
// DB — only the storageKey (object key) is persisted.
@Injectable()
export class S3StorageService extends StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    super();
    this.bucket = config.get<string>('storage.s3.bucket') ?? 'support-attachments';
    this.client = new S3Client({
      endpoint: config.get<string>('storage.s3.endpoint'),
      region: config.get<string>('storage.s3.region'),
      forcePathStyle: config.get<boolean>('storage.s3.forcePathStyle'),
      credentials: config.get<string>('storage.s3.accessKeyId')
        ? {
            accessKeyId: config.get<string>('storage.s3.accessKeyId') as string,
            secretAccessKey: config.get<string>('storage.s3.secretAccessKey') as string,
          }
        : undefined,
    });
  }

  async save(buffer: Buffer, originalName: string, contentType: string): Promise<StoredObject> {
    const storageKey = `${randomUUID()}${extname(originalName).slice(0, 12)}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return { storageKey };
  }

  async read(storageKey: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Object ${storageKey} has no body`);
    return Buffer.from(bytes);
  }
}
