---
title: Plan 02 - Duplicate Merge Flow
tags: [cimp, plan, issues, merge]
updated: 2026-07-10
effort: M (1 week)
status: done (2026-07-10)
---

> **Implemented.** One deviation from the plan as written: resolution fan-out to
> duplicate reporters is **in-app only** (reporter-visible system comment +
> `updatedAt` bump), not email — emailing reporters would violate the existing
> OD-02 decision (reporter notifications are in-app only). Everything else
> landed as specified: `merge.service.ts` (+11 unit tests), `POST
> /staff/issues/:id/merge`, `AddIssueDuplicateOf` migration, chain flattening,
> watcher copy, REOPEN detach, staff UI (merge dialog, banner, duplicates
> list), +3 e2e authorization tests. Verified live end-to-end incl. the
> reporter-privacy invariant.
# Plan 02 — Duplicate merge flow
← [[Plan 00 - How to Execute These Plans]]

## Goal
Staff can merge issue B (duplicate) into issue A (canonical). B closes with a
pointer to A; B's reporter is auto-notified when A resolves. Kills the N-reports
-one-bug toil.

## Decisions (made — do not revisit)
- Source of truth is a new nullable self-FK `issues.duplicate_of_id`. The
  existing `issue_links` row (type DUPLICATES) is ALSO created for UI symmetry,
  but fan-out queries use the column.
- Merge sets the duplicate to `CLOSED` **directly, bypassing the status
  machine** — a sanctioned administrative terminal. Do NOT add new transitions
  to `STATUS_TRANSITIONS`. Document the exception with a comment at the call site.
- No chains: if the chosen canonical itself has `duplicateOfId` set, follow it
  one hop and merge into ITS canonical (flatten), never create A→B→C.
- Un-merge is out of scope (REOPEN on the duplicate clears `duplicateOfId` —
  implement just that clearing in the existing status-change path).
- Privacy invariant: the duplicate's reporter NEVER sees the canonical issue or
  its reference number in reporter-visible surfaces (canonical may belong to a
  different reporter). Staff see everything.
- Comments/attachments are NOT moved (audit integrity). Staff watchers ARE
  copied to the canonical (insert-ignore on the unique constraint).

## Data model
- `Issue` entity: add
  `@ManyToOne(() => Issue, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'duplicate_of_id' }) duplicateOf: Issue | null;`
  plus `@Index('idx_issues_duplicate_of', ['duplicateOf'])`.
- Migration `AddIssueDuplicateOf`: column + index + FK.
- New event in `src/events/issue-events.ts`:
  `MERGED: 'issue.merged'` + `IssueMergedEvent { duplicateIssueId; canonicalIssueId; platformId; actorStaffId }`.

## Backend steps
1. `src/issues/merge.service.ts` (new, provided in `issues.module.ts`):
   `merge(staff, duplicateId, dto: { canonicalIssueId, version })`:
   - Load both issues with `platform` relation. Either missing → 404. Use
     `ScopeService.canAccessPlatform` for the caller on that platform; not
     accessible → **404** (repo convention).
   - Guards: same `platform.id` on both else 422; `duplicateId !== canonical.id`
     else 422; duplicate not already merged (`duplicateOfId` null) else 409;
     optimistic lock: `dto.version !== duplicate.version` → 409.
   - Flatten: if canonical.duplicateOf set → canonical = canonical.duplicateOf (reload).
   - Transaction (`dataSource.transaction`): update duplicate
     (`duplicateOf`, `status: CLOSED`, `closedAt: new Date()`); insert
     issue_link (duplicate→canonical, DUPLICATES) with `orIgnore`; copy watcher
     rows dup→canonical with `INSERT ... ON CONFLICT DO NOTHING` raw query
     (see `src/issues/watchers.service.ts` for the table/columns); system
     comments — reuse the comments service/repo: on duplicate,
     `reporterVisible: true`, body "This issue was identified as a duplicate
     and is being tracked centrally. You'll be notified when it's resolved.";
     on canonical, internal (`reporterVisible: false`), body
     "<referenceNo> merged into this issue as a duplicate."
   - After commit: `eventEmitter.emit(IssueEvents.MERGED, {...})` and an audit
     event (follow the pattern used by status changes in `issues.service.ts`).
2. Controller: add to `src/issues/issues.controller.ts`:
   `@Post(':id/merge')` with the same guard stack as other mutations
   (JwtAuthGuard, PlatformAccessGuard, write roles). DTO
   `src/issues/dto/merge-issue.dto.ts`: `canonicalIssueId` @IsUUID(),
   `version` @IsInt() @Min(1).
3. Resolution fan-out: in `src/notifications/notifications.listener.ts`, in the
   STATUS_CHANGED handler, when `to === RESOLVED`: query
   `issueRepo.find({ where: { duplicateOf: { id: issueId } }, relations: ['reporter'] })`
   and (a) email each duplicate's reporter using the existing resolved-mail
   helper, (b) add a reporter-visible system comment to each duplicate:
   "The underlying issue was resolved." Failures caught per-recipient.
4. Reopen clearing: in the status-change path of `issues.service.ts`, if the
   issue being transitioned to REOPENED has `duplicateOfId`, set it null in the
   same save.
5. List/detail responses: include `duplicateOfId` and, for staff only, the
   canonical's `referenceNo`; include `duplicateCount` on staff detail
   (`COUNT(*) WHERE duplicate_of_id = :id`). Reporter-facing serializers must
   NOT include canonical identifiers — check `reporter.service.ts` response
   shaping and keep the invariant.

## Frontend steps (staff)
1. `IssueDetailPanel.tsx`: add a "Merge into…" action (dropdown or button near
   status controls), gated by the same canWrite logic used for status/assign.
   Dialog: search input → existing staff issues search endpoint filtered to the
   same platform, exclude self and already-merged; select → confirm → POST
   merge with current `version`; on 409 toast "Issue changed — refresh".
2. Merged (duplicate) view: banner "Duplicate of <referenceNo>" linking to the
   canonical; disable mutation controls (it's CLOSED anyway).
3. Canonical view: "Duplicates (N)" row in IssueExtras listing merged refs.
4. Reporter portal (`ReporterIssueDetailPage.tsx`): no change needed — the
   system comment and CLOSED status carry the message. Verify nothing renders
   `duplicateOfId` here after `gen:api`.

## Tests
- `src/issues/merge.service.spec.ts` (mirror `issue-links.service.spec.ts`
  stubbing style): happy path sets column+status+closedAt; cross-platform → 422;
  unscoped staff → 404; version mismatch → 409; already-merged → 409;
  chain flattens one hop; watcher copy dedupes.
- Extend notifications listener spec: RESOLVED on canonical notifies duplicate
  reporters and comments on duplicates.
- e2e: focal point of another platform gets 404 on merge; reporter payload for
  a merged issue contains no canonical reference.

## Acceptance
Seed demo data → merge two same-platform issues in the UI → duplicate shows
banner + CLOSED; resolve canonical → duplicate gets reporter-visible comment
and its reporter gets the email (log output when SMTP blank).

## Gotchas
- Self-FK in TypeORM: relation property `duplicateOf` but queries by
  `{ duplicateOf: { id } }`; the raw column is `duplicate_of_id`.
- Don't emit STATUS_CHANGED for the merge close (it would trigger automation
  rules and normal notifications) — MERGED is the only event; the duplicate's
  reporter is informed via the system comment + merged email if desired.
- The unique constraint on issue_links is (source,target,type) — use orIgnore.
