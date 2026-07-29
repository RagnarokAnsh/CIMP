---
title: Module - Common and Config
tags: [cimp, backend, config, security]
updated: 2026-07-27
---
# Module — Common and Config (`src/common/`, `src/config/`)
← [[Backend Modules and API]] · [[CIMP - Home]]

Shared primitives + the fail-closed configuration layer.

## Common (`src/common/`)
| File | Responsibility |
|---|---|
| `enums.ts` | **All shared enums** — reuse, never restring. `Role`, `IssueStatus`, `Priority`, `CommentVisibility`, `ScanStatus`, `ActorType`, `RecipientType`, `NotificationChannel`, `NotificationStatus`, `JiraSyncStatus`, `PlatformStatus`, `AccountStatus`, `IssueLinkType`, `AutomationTrigger`, `AutomationAction`, `ComponentStatus`, `IncidentStatus`, `IncidentImpact`. |
| `constants.ts` | `MAX_FILES` (5), `MAX_FILE_BYTES` (10MB), `ALLOWED_MIME_TYPES` (png/jpeg/webp/pdf), `OPEN_ISSUE_STATUSES`. |
| `content-disposition.ts` | RFC-5987-safe `Content-Disposition` filename for downloads. |
| `db-errors.ts` | **`isUniqueViolation(e)`** — the Postgres `23505` check, centralized. New code imports this instead of re-deriving the `QueryFailedError.driverError` cast (it was hand-rolled in six files). |
| `filters/http-exception.filter.ts` | **`AllExceptionsFilter`** — consistent error body; maps TypeORM `OptimisticLockVersionMismatchError` → **409** and Postgres `22P02` → **400**; **normalizes every 429 to one friendly sentence**; logs 401/403 (warn) + non-`Error` throws; hides internals in prod. |

## Config (`src/config/`)
| File | Responsibility |
|---|---|
| `configuration.ts` | Env → nested config object (`database.*`, `auth.*`, `scan.*`, `storage.*`, `mail.*`, `jira.*`, `selfSupport.*`, `translation.*`, `focalPointCanTransition`, `throttle.*`, `trustProxy`, sla). |
| `env.validation.ts` | Joi shape + **`validate()`** fail-closed guards (prod refuses to boot on unsafe config). |
| `is-production.ts` | **`isProductionEnv()`** — any `NODE_ENV` not exactly `development`/`test` = production (fail-closed). Used by both `env.validation.ts` and `main.ts` so they can't disagree. |

## Gotchas / invariants
- **Fail-closed is the whole point:** an unset/misspelled `NODE_ENV` is treated as production, and prod won't boot without `DB_SYNCHRONIZE=false`, explicit `CORS_ORIGINS`, `JWT_SECRET`≥32, and a scanner (or opt-out). Full rules → [[Configuration and Env]].
- The global `ValidationPipe` (in `main.ts`) enforces `whitelist + forbidNonWhitelisted + transform`.
- **429s never carry the raw `ThrottlerException: Too Many Requests` string.** `ThrottlerException`'s default message is class-name-prefixed and meaningless to a user; the filter rewrites the body so *any* client (staff UI, reporter portal, SDK, integrations) can show it verbatim. The frontend mirror is `lib/api-error.ts` → [[Frontend - Components, Lib and API]].

## Related
[[Configuration and Env]] · [[Security Audit and Hardening]] · [[Data Model]] · [[Frontend - Components, Lib and API]]
