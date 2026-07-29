---
title: Module - Translation
tags: [cimp, backend, translation, i18n, seam]
updated: 2026-07-27
---
# Module - Translation (`src/translation`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** Machine translation of reporter↔staff messages, as a **swappable env-chosen seam** like `storage/` and `scanning/`. Default `none` — an unconfigured deployment behaves exactly as before and nothing leaves the box.

**Core invariant: `Comment.body` is always the original text.** Translations are a cached extra in a jsonb column. A provider outage therefore degrades to "reader sees the untranslated message", never to a failed reply.

## Files
| File | Responsibility |
|---|---|
| `translation.service.ts` | Abstract `TranslationService` (`isEnabled`, `translate`, `detect`) + `baseLocale()` helper (`'en-GB'`/`'EN_gb'` → `'en'`, else null). |
| `noop-translation.service.ts` | Default driver — reports `isEnabled() === false`, returns input unchanged. |
| `libretranslate.service.ts` | LibreTranslate-compatible HTTP driver. 8s timeout, `redirect: 'manual'`, optional `api_key`. |
| `translation.module.ts` | `@Global()`; picks the driver by `translation.driver`; registers `TranslationListener`. |
| `translation.listener.ts` | Fills the cache off `IssueEvents.COMMENT_ADDED`. |
| `translation.listener.spec.ts` | 6 specs — disabled short-circuit, inbound translate, failed-translation not cached, internal-note skip, reporter-locale pre-warm, exception swallowed. |

## Configuration
| Env | Meaning |
|---|---|
| `TRANSLATE_DRIVER` | `none` (default) \| `libretranslate` |
| `TRANSLATE_API_URL` / `TRANSLATE_API_KEY` | Provider endpoint + optional key |
| `TRANSLATE_STAFF_LOCALE` | Language the support team reads (default `en`) — inbound reporter messages are translated into it |
| `TRANSLATE_REPORTER_LOCALES` | Comma-separated languages to pre-translate staff replies into, e.g. `es,fr,de` |

→ [[Configuration and Env]]

## Key classes & logic
**`TranslationListener.onCommentAdded(evt)`** — `@OnEvent(COMMENT_ADDED, { async: true })`, never in the request path (same discipline as [[Module - Notifications]]):
- Returns immediately when `!translation.isEnabled()` — no DB read at all.
- Target selection: a **reporter-authored** comment → `[staffLocale]`. A **staff `REPORTER_VISIBLE`** comment → the configured `reporterLocales`. An **`INTERNAL` note is skipped entirely** — it is staff-to-staff and no reporter will ever read it.
- Source language: `comment.sourceLocale` if the portal declared one, else `provider.detect()`.
- **A provider returns the input unchanged on failure, so a result equal to `body` is never cached** — otherwise the cache fills with "translations" that are just the original.
- Persists with a targeted `repo.update({ id }, …)` rather than `save(entity)`, so a concurrent comment edit can't be clobbered by a stale in-memory copy.
- All failures are caught and logged at WARN.

## Where translations are served
| Surface | Behaviour |
|---|---|
| Reporter detail (`ReporterService.getIssueForReporter`) | Serves `translations[ctx.reporter.locale]` when present; returns `originalBody` + `translated: true` alongside so the portal can offer "show original". |
| Staff detail (`IssuesService.getDetail`) | Serves `translations[staffLocale]` for reporter messages, with `originalBody`, `translated`, `sourceLocale`. |
| Reporter reply (`ReporterService.addComment`) | Stamps `sourceLocale` from the hand-off token, so no provider-side detection is needed. |

The reporter's language comes from the **optional `locale` claim on the hand-off token** → [[Module - Handoff]]. It is normalized with `baseLocale()` and a malformed value is dropped, never rejected — the worst case of a bad locale is an untranslated message, not a failed hand-off.

## Guards & auth
None — this module exposes no routes. It is a listener + injectable seam.

## Events
**Consumes** `IssueEvents.COMMENT_ADDED`. Emits nothing. → [[Domain Events and Issue Lifecycle]]

## Entities touched
`Comment.sourceLocale` (varchar 8, nullable) and `Comment.translations` (jsonb, nullable — `{ es: '…', fr: '…' }`). Both added by migration **#20** `AddCommentTranslations`. See [[Entity Reference]].

## Gotchas / invariants
- **Never treat `translations` as the source of truth.** `body` is the original; an absent entry simply means "show the original".
- `IssuesService` deliberately re-implements a tiny `toBaseLocale` locally rather than importing the seam, so the issues module takes no dependency on an optional feature.
- Outbound HTTP refuses redirects (same reasoning as the webhook sender — don't walk a payload + API key somewhere unvetted).
- Enabling this sends comment text to the configured provider. Self-host LibreTranslate if that matters — see [[Security Audit and Hardening]].

## Related
[[Module - Comments]] · [[Module - Reporter]] · [[Module - Issues]] · [[Module - Handoff]] · [[Configuration and Env]] · [[Frontend - Reporter Surface]] · [[Features - Shipped]]
