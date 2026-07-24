---
title: Module - Storage and Scanning
tags: [cimp, backend, seams, security]
updated: 2026-07-06
---
# Module — Storage and Scanning (`src/storage/`, `src/scanning/`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** The two **swappable seams** for attachments: where files live (disk vs S3) and whether they're malware-scanned. Both chosen by env; neither is in the request-critical decision path.

## Files
| File | Responsibility |
|---|---|
| `storage/storage.service.ts` | `StorageService` abstraction (`save`/`read`/`delete`), delegates to the driver. |
| `storage/local-disk-storage.service.ts` | Disk driver (`STORAGE_DIR`); `delete` unlinks, ENOENT = success. |
| `storage/s3-storage.service.ts` | S3/MinIO driver (`S3_*`); `delete` = `DeleteObjectCommand` (idempotent). |
| `storage/storage.module.ts` | Provides `StorageService` per `STORAGE_DRIVER`. |
| `scanning/scan.service.ts` | `ScanService` seam. |
| `scanning/noop-scan.service.ts` | Default — marks files **SKIPPED** (servable). |
| `scanning/clamav-scan.service.ts` | Streams the buffer to a clamd daemon (`CLAMAV_*`). |
| `scanning/scanning.listener.ts` | `@OnEvent(issue.created)` → scans each attachment (via `scanAndPersist`), emits `issue.attachments_scanned`. |
| `scanning/scan-retry.service.ts` | `@Cron` every 10 min: re-scans attachments stranded at PENDING (older than a 15-min grace so it never races intake), bounded batch of 25, re-emits `issue.attachments_scanned` for any that became servable. `SCAN_RETRY_ENABLED=false` disables. |
| `scanning/scanning.module.ts` | Provides `ScanService` per `SCAN_DRIVER`; registers the retry sweep. |

## Key logic
- **Storage:** `save(buffer, filename, contentType)` → `{ storageKey }`; `read(storageKey)` → `Buffer`; `delete(storageKey)` (idempotent, never throws on a missing object). `storageKey` abstracts the backend so serving code is driver-agnostic. Intake writes blobs before the DB row exists, so [[Module - Reporter]] `createIssue` best-effort `delete`s them if persistence ultimately fails, rather than orphaning them.
- **Scanning:** attachments start `PENDING` at intake; the listener updates them to CLEAN/INFECTED (clamav) or SKIPPED (noop). **Only CLEAN/SKIPPED are ever served** (enforced in [[Module - Reporter]] + issues attachment download). The scan-then-persist step is one helper (`scanAndPersist`) shared by the intake listener and the retry sweep.

## Config & guards
`STORAGE_DRIVER`, `SCAN_DRIVER`, `ALLOW_UNSCANNED_UPLOADS`, `CLAMAV_*`, `S3_*`, `SCAN_RETRY_ENABLED` → [[Configuration and Env]]. **Prod requires `SCAN_DRIVER=clamav`** unless the unscanned opt-out is set (fail-closed).

## Gotchas / invariants
- PENDING/INFECTED files are never downloadable.
- Uploaded content type is **sniffed** (magic bytes) at intake, not trusted from the client (H5) — see [[Module - Reporter]] / [[Security Audit and Hardening]].
- ~~Known gap (audit L6): a transient scan failure leaves a file PENDING with no auto-retry.~~ **Fixed (2026-07-24):** `scan-retry.service.ts` sweeps stuck-PENDING files every 10 min. No per-row attempt counter (would need a migration), so a genuinely un-scannable file is retried every tick forever — the sweep logs a persistent count so ops can spot one.
- The retry sweep's 15-min grace window is load-bearing: a just-uploaded file is legitimately PENDING while the intake listener scans it, so the sweep ignores anything younger to avoid double-reading the bytes.

## Related
[[Module - Reporter]] · [[Domain Events and Issue Lifecycle]] · [[Security Audit and Hardening]] · [[Configuration and Env]]
