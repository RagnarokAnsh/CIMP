---
title: Frontend - Reporter Surface
tags: [cimp, frontend, react, reporter, i18n]
updated: 2026-07-27
---
# Frontend — Reporter Surface (`frontend/src/reporter/`)
← [[Frontend Overview]] · [[CIMP - Home]]

The `/reporter/*` SPA surface — what an end user of a connected portal sees. **No login:** authenticated entirely by the hand-off token captured at load (`api/handoff.ts`, sent as `X-Handoff-Token`). → [[Auth and Authorization]]

## Files
| File | Responsibility |
|---|---|
| `NewIssuePage.tsx` | The two-field intake: description (10–5000 chars) + ≤5 attachments (client-side type/size checks mirror the server's; server re-sniffs). Shows "No portal session" if no hand-off token. |
| `MyIssuesPage.tsx` | The reporter's own issue list with an "updates" indicator (`hasUpdates`). |
| `ReporterIssueDetailPage.tsx` | Detail: status/priority, description, attachments (scan-gated), and **REPORTER_VISIBLE updates only** (INTERNAL notes never returned by the server). Reporter can reply. `UpdateBubble` renders each message and, for a machine-translated one, a **"show original"** toggle. |

## Localization (`frontend/src/i18n/`)
The reporter portal is **localized**; the staff workspace deliberately is not (an internal tool for one team, versus a surface embedded in partner portals whose users may read anything).

| File | Responsibility |
|---|---|
| `i18n/locales.ts` | Flat key→string dictionaries. **`en` is the source of truth and defines the key type** (`TranslationKey`); `es`/`fr`/`de` are `Partial`s. `LOCALES` carries each language's own endonym for the switcher. |
| `i18n/index.tsx` | `I18nProvider`, `useT()` → `{ locale, setLocale, t }`, `detectLocale()`, `{name}` interpolation. |
| `i18n/LanguageSwitcher.tsx` | Dropdown listing every language in its **endonym** ("Español", not "Spanish") — someone who can't read the current UI language must still find theirs. |
| `i18n/useStatusLabel.ts` | Localized `IssueStatus` **and** `Priority` labels (`useStatusLabel` / `usePriorityLabel`), paired with the `label` prop on `StatusBadge` / `PriorityBadge`. |

- **Dependency-free by choice.** Three small pages with a flat key set; react-i18next's loaders/plural engine/namespaces would all go unused. The `useT()` call sites already match its shape, so swapping later is mechanical.
- **Locale precedence:** `?lang=` (portal deep-link) → `localStorage` → `navigator.language` → `en`. Persisted; storage failures (private mode / locked-down embed) fall through to English rather than breaking the page.
- **Fallback is per *key*, not per locale** — a partially translated dictionary shows real English text, never a blank or a raw key.
- `useT()` is safe outside the provider (returns English), so a component rendered in isolation or under test never crashes.
- `<html lang>` is kept in sync for screen readers and browser translation.

## Reuse note
`StatusBadge` gained an optional **`label`** prop rather than being forked: the portal passes a translated label while both surfaces keep one badge component and one set of contrast-checked colours. → [[Frontend - Components, Lib and API]]

**Completed 2026-07-27.** The localisation had two holes that a UI/UX audit caught: the issue table's four column headers were English literals, and `PriorityBadge` had never been given the `label` prop `StatusBadge` got for exactly this purpose — so a Spanish reporter saw Spanish navigation, Spanish empty states and a Spanish status badge sitting next to an English "Critical". Eight keys added across all four locales. The lesson worth keeping: when a shared component is given an i18n escape hatch, check its siblings — the pattern was half-applied for weeks without anything failing.

## Data flow
- All calls go through `reporterApi` with `X-Handoff-Token`; the token was captured from `?handoff=`/postMessage into `sessionStorage` and stripped from the URL.
- The server ([[Module - Reporter]]) scopes every read to the token's reporter (ownership) — a reporter can only ever see their own issues.
- **Machine translation is server-side and independent of the UI language.** The portal's *chrome* language comes from `useT()`; which translation of a *message* the reporter receives comes from the `locale` claim on the hand-off token. Each update carries `translated` + `originalBody` so the original is always one click away. → [[Module - Translation]]

## Gotchas / invariants
- The reporter surface is embedded/opened by a portal (or CIMP's own [[Module - Self-Support|Support button]]); it is useless without a valid hand-off token.
- INTERNAL comments and other reporters' data are enforced server-side, not here.
- Adding a user-facing string means adding a key to **`en`** first — it is the type source, so a missing key is a compile error at the call site.

## Related
[[Frontend Overview]] · [[Frontend - Components, Lib and API]] · [[Module - Reporter]] · [[Module - Handoff]] · [[Module - Translation]] · [[cimp-connect Package]]
