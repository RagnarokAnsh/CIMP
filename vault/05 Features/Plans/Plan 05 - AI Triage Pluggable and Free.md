---
title: Plan 05 - AI Triage Pluggable and Free
tags: [cimp, plan, ai, triage]
updated: 2026-07-10
effort: M (1-2 weeks)
status: planned
depends: Plan 02 (merge apply button)
---
# Plan 05 — AI triage (pluggable driver, runs free)
← [[Plan 00 - How to Execute These Plans]]

## Goal
On every new issue, compute suggestions — priority, labels, likely duplicates,
a draft first reply — and show them to staff as one-click Apply chips. Never
auto-apply. Works with zero cost via Ollama/Groq/Gemini free tiers, and still
provides duplicate candidates with NO model configured (FTS heuristics).

## Decisions (made — do not revisit)
- **One driver: `openai-compat`.** Ollama, Groq, Google AI Studio and
  OpenRouter all expose the OpenAI chat-completions API, so a single HTTP
  client covers local-free and hosted-free. Config (add to `.env.example` and
  the config validation in `src/config/`):
  `TRIAGE_DRIVER=none|openai` (default none), `TRIAGE_BASE_URL`
  (e.g. `http://localhost:11434/v1` for Ollama, `https://api.groq.com/openai/v1`),
  `TRIAGE_MODEL` (e.g. `qwen2.5:7b-instruct`, `llama-3.3-70b-versatile`),
  `TRIAGE_API_KEY` (optional — Ollama needs none).
- Heuristic layer ALWAYS runs, even with driver none: duplicate candidates =
  top 5 same-platform OPEN(-ish) issues by FTS rank against the new
  description. Uses the existing `search_vector` GIN index; where the migration
  hasn't run (dev synchronize), fall back to `ILIKE` on description and accept
  worse results (mirror how search handles this — read the FTS filter in
  `src/issues/issues.service.ts` first and reuse it).
- LLM contract: single chat completion, `response_format: { type: 'json_object' }`
  when the server supports it, temperature 0.2, 20s timeout, max 1 retry.
  Defensive parse: extract first `{...}` block; on any failure store the
  heuristic-only suggestion. A triage failure must NEVER surface as an error.
- Suggestions are stored, not applied. Apply buttons call the EXISTING
  endpoints (priority update, label attach, merge from Plan 02, comment
  composer prefill) so authorization/audit paths stay single.
- Privacy note in README/vault: with hosted free tiers the issue description
  leaves the server; with Ollama nothing does. Description clamped to 4000
  chars in the prompt.

## Data model
`src/entities/triage-suggestion.entity.ts`, table `triage_suggestions`:
`id` uuid PK; `issue` OneToOne→Issue (unique, CASCADE); `suggestedPriority`
enum Priority nullable; `suggestedLabelIds` jsonb string[]; `duplicateCandidates`
jsonb `[{ issueId, referenceNo, score }]`; `draftReply` text nullable;
`model` varchar nullable (null = heuristics-only); `status` enum
`TriageSuggestionStatus` PENDING|ACCEPTED|DISMISSED (add to common/enums.ts);
`createdAt`. Migration `AddTriageSuggestions`.

## Backend steps
1. `src/triage/triage.module.ts` (+ app.module import),
   `src/triage/triage.service.ts`, `src/triage/triage.listener.ts`,
   `src/triage/triage.controller.ts`.
2. Service:
   - `findDuplicateCandidates(platformId, description)` — FTS query as decided;
     exclude CLOSED and already-merged (`duplicate_of_id IS NULL`).
   - `suggest(issueId)` — load issue + platform label catalog
     (`labels.service` or repo); run heuristics; if driver=openai, build prompt:
     system: "You triage support issues. Answer ONLY minified JSON:
     {\"priority\":\"LOW|MEDIUM|HIGH|CRITICAL\",\"labelIds\":[],\"duplicateOf\":null|\"<issueId>\",\"draftReply\":\"...\"}.
     Only use labelIds from the catalog. Only set duplicateOf to one of the
     provided candidate ids when clearly the same problem."
     user: description (clamped) + label catalog `[{id,name}]` + candidates
     `[{issueId, referenceNo, snippet}]`. Validate the response: priority in
     enum, labelIds ⊆ catalog, duplicateOf ∈ candidates — drop invalid fields
     silently. Upsert the suggestion row.
3. Listener: `@OnEvent(IssueEvents.CREATED, { async: true })` → try/catch
   around `suggest()`; `Logger.warn` on failure.
4. Controller (staff): `GET /api/staff/issues/:id/triage` (read roles, scope
   via PlatformAccessGuard — copy an existing issue-scoped GET);
   `POST /api/staff/issues/:id/triage/dismiss` and `/accept` just flip status
   (write roles). DTO-less POSTs are fine (no body).
5. Config validation: if TRIAGE_DRIVER=openai then TRIAGE_BASE_URL and
   TRIAGE_MODEL required — follow the fail-closed pattern in `src/config/`.

## Frontend steps (staff)
`IssueDetailPanel.tsx`: query the triage endpoint; when PENDING and non-empty
render a dismissible "Suggestions" card: priority chip with Apply (calls the
existing priority mutation), label chips with Apply, duplicate candidates as
"Possible duplicate of <ref> (view · merge)" (merge = Plan 02 dialog
pre-filled), "Use draft reply" inserts draftReply into the comment composer
(does NOT send). Accept/dismiss update the suggestion status. Run `gen:api`.

## Free-tier setup notes (document in vault + .env.example comments)
- Ollama on the EC2 (needs ~8GB RAM) or any LAN box:
  `curl -fsSL https://ollama.com/install.sh | sh && ollama pull qwen2.5:7b-instruct`
  → `TRIAGE_BASE_URL=http://localhost:11434/v1`, no key. Truly free + private.
- Groq: free key at console.groq.com → base `https://api.groq.com/openai/v1`,
  model `llama-3.3-70b-versatile`. Fastest; generous free tier.
- Google AI Studio: free key → base
  `https://generativelanguage.googleapis.com/v1beta/openai`, model
  `gemini-2.0-flash` (or current flash). ~1.5k req/day free.
- Support intake volume (tens/day) fits all of these permanently.

## Tests
- `triage.service.spec.ts`: mocked fetch driver — valid JSON parsed; invalid
  labelIds dropped; garbage response → heuristic-only row; timeout → row still
  written; candidates exclude merged/closed.
- Listener spec: thrown service error is swallowed (spy on Logger, no rethrow).
- e2e: GET triage respects scoping (foreign platform → 404).

## Gotchas
- OneToOne + upsert: use repo.upsert on issue_id or find-then-save; the CREATED
  listener can race a retry — last write wins is fine.
- Don't put the LLM call in the request path or the automation listener —
  separate listener, async.
- `response_format` unsupported on some Ollama models — always defensive-parse.
