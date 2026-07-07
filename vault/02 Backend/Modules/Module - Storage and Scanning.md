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
| `storage/storage.service.ts` | `StorageService` abstraction (`save`/`read`), delegates to the driver. |
| `storage/local-disk-storage.service.ts` | Disk driver (`STORAGE_DIR`). |
| `storage/s3-storage.service.ts` | S3/MinIO driver (`S3_*`). |
| `storage/storage.module.ts` | Provides `StorageService` per `STORAGE_DRIVER`. |
| `scanning/scan.service.ts` | `ScanService` seam. |
| `scanning/noop-scan.service.ts` | Default — marks files **SKIPPED** (servable). |
| `scanning/clamav-scan.service.ts` | Streams the buffer to a clamd daemon (`CLAMAV_*`). |
| `scanning/scanning.listener.ts` | `@OnEvent(issue.created)` → scans each attachment, sets `scanStatus`, emits `issue.attachments_scanned`. |
| `scanning/scanning.module.ts` | Provides `ScanService` per `SCAN_DRIVER`. |

## Key logic
- **Storage:** `save(buffer, filename, contentType)` → `{ storageKey }`; `read(storageKey)` → `Buffer`. `storageKey` abstracts the backend so serving code is driver-agnostic.
- **Scanning:** attachments start `PENDING` at intake; the listener updates them to CLEAN/INFECTED (clamav) or SKIPPED (noop). **Only CLEAN/SKIPPED are ever served** (enforced in [[Module - Reporter]] + issues attachment download).

## Config & guards
`STORAGE_DRIVER`, `SCAN_DRIVER`, `ALLOW_UNSCANNED_UPLOADS`, `CLAMAV_*`, `S3_*` → [[Configuration and Env]]. **Prod requires `SCAN_DRIVER=clamav`** unless the unscanned opt-out is set (fail-closed).

## Gotchas / invariants
- PENDING/INFECTED files are never downloadable.
- Uploaded content type is **sniffed** (magic bytes) at intake, not trusted from the client (H5) — see [[Module - Reporter]] / [[Security Audit and Hardening]].
- Known gap (audit L6): a transient scan failure leaves a file PENDING with no auto-retry.

## Related
[[Module - Reporter]] · [[Domain Events and Issue Lifecycle]] · [[Security Audit and Hardening]] · [[Configuration and Env]]
