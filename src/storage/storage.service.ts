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

  // Removes an object by its storage key. Exists so callers that write blobs
  // before their DB rows commit can undo the write when persistence fails —
  // otherwise the bytes stay unreferenced forever.
  // Implementations must be idempotent: a key that is already gone is a success,
  // so a cleanup path can never turn one failure into two.
  abstract delete(storageKey: string): Promise<void>;
}
