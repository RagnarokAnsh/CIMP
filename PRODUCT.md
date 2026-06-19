# Product

## Register

product

## Users
Internal support staff working in a task all day: **Focal Points** (triage a portal's
incoming issues), **Developers** (work and resolve issues for their portals), and **Admins**
(manage portals, staff, roles, and integrations across everything). They live in this tool
for hours, scan long issue lists, and context-switch between triage, detail, and resolution.
A second audience — **Reporters** (end users of connected portals) — touch only a tiny,
login-free intake surface and an emailed/linked status view; for them speed and clarity beat
features.

## Product Purpose
CIMP is a centralized support & issue-management platform — an internal, lightweight Jira.
Issues raised from any connected portal land in one system with the right portal attached,
get routed, triaged, assigned, and tracked through a defined lifecycle with a full audit
trail, optionally syncing to Jira. Success = nothing gets lost, ownership is always clear,
and staff move through triage → resolution fast without fighting the UI.

## Brand Personality
Confident, fast, and precise — a professional tool that feels modern and a little premium
without being flashy. Three words: **sharp, dependable, energetic**. Staff should trust it
instantly (earned familiarity with the best tools they know) while it still feels distinctly
crafted, not a default admin template.

## Anti-references
- The current build: flat, dark-only, single desaturated gray with one azure accent — no
  hierarchy, no depth, muted badges. That's the thing we're escaping.
- Generic Bootstrap/MUI admin dashboards; default unstyled shadcn slate.
- "AI-purple" mesh-gradient-on-everything, glassmorphism on every card, gratuitous motion.
- Atlassian Jira's heaviness and clutter — we want its power, not its density-for-its-own-sake.

## Design Principles
1. **The tool disappears into the task.** Earned familiarity over novelty; standard affordances
   (top bar + side nav, tables, command palette) done exceptionally well.
2. **Bold through depth, not decoration.** Personality comes from tinted elevation, considered
   gradient on hero surfaces, and a vivid accessible palette — never full-saturation noise.
3. **Every state is designed.** default / hover / focus / active / disabled / loading / error /
   empty for every interactive thing. Skeletons, not spinners. Empty states teach.
4. **Motion conveys state, never performs.** 150–250 ms, ease-out; feedback and reveals only.
5. **Speed is a feature.** Keyboard-first, command palette, scannable density, instant feedback.

## Accessibility & Inclusion
Target **WCAG 2.1 AA** (BRD NFR-A11Y-01). Body text ≥ 4.5:1, large/UI ≥ 3:1 — verified in
**both** light and dark. Never rely on color alone for status/priority (pair with label/icon
for color-blind users). Full keyboard navigation, visible focus rings, and a
`prefers-reduced-motion` alternative for every animation.
