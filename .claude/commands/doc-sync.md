---
description: Update the Obsidian vault (module notes + Changelog + Session Handoff) to reflect recent code changes, then QA links.
argument-hint: "[optional: git range e.g. main..dev, or 'working' for uncommitted changes]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Read, Edit, Write, Grep, Glob
---

You are updating the project's Obsidian knowledge vault at `vault/` so it stays an
accurate, LLM-readable mirror of the codebase. Documentation tracks **meaningful
units of work**, not keystrokes — be surgical, not noisy.

## Scope of changes to document

Argument: `$ARGUMENTS`
- If it looks like a git range (e.g. `main..dev`, `HEAD~5..HEAD`), document that range.
- If it is `working` or empty, inspect **uncommitted + recently committed** work:
  run `git status` and `git diff --stat` for the working tree, and
  `git log --oneline -15` to see what landed recently. Focus on what changed since
  the vault was last updated (check `vault/08 Meta/Changelog.md` for the last entry).

## What to do

1. **Identify the affected areas.** Map changed files to vault notes:
   - `src/<module>/**` → the matching note in `vault/02 Backend/Modules/`.
   - `frontend/**` → notes in `vault/03 Frontend/`.
   - entities / migrations → `vault/01 Architecture/Entity Reference` and
     `vault/02 Backend/Migrations Log`.
   - new routes/guards/events → the module note's routes/events sections +, if
     cross-cutting, `vault/01 Architecture/`.
   - config/env changes → `vault/02 Backend/Configuration and Env`.
   Use `Grep`/`Glob` inside `vault/` to find the right note; don't guess filenames.

2. **Read the note before editing it**, then update ONLY the sections that the code
   change actually affects. Preserve each note's strict template (Files table ·
   routes+guards · key classes/logic · dependencies · events · entities · gotchas ·
   wikilinks). Keep wording tight and code-grounded — an agent should be able to
   read the note instead of the source.

3. **Append a Changelog entry** to `vault/08 Meta/Changelog.md` (reverse-chron, under
   the current month heading) summarizing the change in 1–2 lines with `[[wikilinks]]`
   to the notes touched.

4. **Update `vault/08 Meta/Session Handoff.md`** if the change alters current state,
   test counts, "what's next", or gotchas. Do not rewrite it wholesale.

5. **Broken-link QA pass.** Collect every `[[wikilink]]` target across the notes you
   touched and confirm a matching note file exists in `vault/` (match on the note's
   base filename or `title:` frontmatter). Fix or flag any dangling links you find.

## Output

End with a short summary: which notes you updated and why, the Changelog line you
added, and any dangling links you found/fixed. Do NOT commit — leave that to the user.
