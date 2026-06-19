export interface StoredObject {
  storageKey: string;
}

// Storage abstraction. The dev implementation writes to local disk; swap in
// an S3/MinIO implementation in production without touching callers.
export abstract class StorageService {
  abstract save(
    buffer: Buffer,
    originalName: string,
    contentType: string,
  ): Promise<StoredObject>;

  // Reads an object back by its storage key (used to serve attachments and to
  // push them to Jira).
  abstract read(storageKey: string): Promise<Buffer>;
}
