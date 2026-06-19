# Design

The CIMP visual system: a bold-but-disciplined product UI. Personality comes from **tinted
depth, a considered indigo→violet brand gradient on hero surfaces, and a vivid AA-accessible
palette** — applied over a calm cool-neutral base. First-class **light and dark** themes;
system-following and user-persisted. Built on Tailwind v4 (tokens in `index.css` `@theme`),
shadcn/ui, and GSAP for state-conveying motion.

## Theme
- Two equal themes. `next-themes`, `attribute="class"`, `defaultTheme="system"`, persisted.
- Cool neutral family tinted toward indigo (hue ≈ 265) so neutrals and accent feel cohesive.
- Dark mode is a **deep blue-charcoal**, never pure black. Light mode has a faintly cool
  off-white app background with white panels for depth.
- A distinct second neutral layer for the sidebar/toolbars (cooler/darker than content).

## Color (OKLCH)

### Neutrals — Light
- background `oklch(0.985 0.004 265)` · surface/card `oklch(1 0 0)` · elevated `oklch(1 0 0)`
- foreground `oklch(0.21 0.02 265)` · muted-foreground `oklch(0.52 0.02 265)`
- border `oklch(0.915 0.005 265)` · input `oklch(0.885 0.006 265)`
- sidebar `oklch(0.97 0.006 265)`

### Neutrals — Dark
- background `oklch(0.17 0.015 265)` · surface/card `oklch(0.21 0.016 265)` · elevated `oklch(0.25 0.016 265)`
- foreground `oklch(0.97 0.005 265)` · muted-foreground `oklch(0.71 0.012 265)`
- border `oklch(1 0 0 / 9%)` · input `oklch(1 0 0 / 14%)`
- sidebar `oklch(0.15 0.016 265)`

### Accents
- **primary (indigo)** — light `oklch(0.52 0.20 264)`, dark `oklch(0.67 0.17 264)`; fg `oklch(0.99 0 0)`
- **secondary accent (teal)** — light `oklch(0.70 0.13 195)`, dark `oklch(0.76 0.12 195)`
- **brand gradient** — `linear-gradient(135deg, oklch(0.55 0.20 264) 0%, oklch(0.58 0.20 295) 100%)`
  (indigo→violet). Hero surfaces only: sidebar brand lockup, dashboard hero, occasional primary CTA.
  Deliberately **not** a background-everywhere mesh.

### Semantic (vivid, AA in both themes; always paired with a label/icon, never color alone)
| Token | Light | Dark | Use |
|---|---|---|---|
| success | `oklch(0.62 0.15 155)` | `oklch(0.72 0.15 158)` | resolved, positive |
| warning | `oklch(0.70 0.15 75)` | `oklch(0.80 0.15 80)` | in-progress, caution |
| danger | `oklch(0.58 0.22 25)` | `oklch(0.68 0.20 25)` | critical, destructive |
| info | `oklch(0.58 0.16 240)` | `oklch(0.70 0.14 240)` | new, neutral-info |

Soft badge fills: tinted background + saturated text + hairline border, tuned per theme
(darker text on light tint in light mode; `color/15` fill + `-300/-400` text in dark).

### Status / Priority mapping
- Status — NEW = info · IN_PROGRESS = warning · ON_HOLD = slate(muted) · RESOLVED = success ·
  CLOSED = muted · REOPENED = violet `oklch(0.62 0.19 295)`.
- Priority — LOW = slate · MEDIUM = info · HIGH = `oklch(0.66 0.16 55)` (orange) · CRITICAL = danger.

### Charts
`--chart-1` indigo (primary), `-2` teal, `-3` emerald, `-4` amber, `-5` rose — vivid, distinct, AA.

## Typography
- One family: **Geist** (sans) + **Geist Mono** (references, IDs, numeric data). Load via
  `@fontsource-variable/geist` + `@fontsource-variable/geist-mono` (no external CDN). System fallback.
- **Fixed rem scale**, ratio ≈ 1.2 — base 0.875rem (14px) for dense product UI:
  xs 0.75 · sm 0.8125 · base 0.875 · md 1 · lg 1.125 · xl 1.375 · 2xl 1.75 · 3xl 2.25 · display 3rem.
- Weights 400/500/600/700. Headings 600–700, tight tracking (−0.01 to −0.02em). Labels 500.
- `font-variant-numeric: tabular-nums` on tables/metrics (already present); mono for reference numbers.

## Spacing & Layout
- 4px base spacing scale (Tailwind default). Generous but not airy — this is a tool.
- Staff: persistent **left sidebar (≈248px, collapsible to 64px) + sticky top bar**, content
  `max-w-screen-2xl` with comfortable gutters (not the current cramped `max-w-6xl`).
- Reporter: centered single column, minimal — unchanged structurally.
- Responsiveness is structural: sidebar collapses to icons/sheet < lg; tables get priority
  columns + horizontal scroll; board columns scroll horizontally.

## Radius & Elevation
- `--radius: 0.75rem`; scale sm `calc(r-4px)` · md `calc(r-2px)` · lg `r` · xl `calc(r+4px)` · 2xl `calc(r+8px)`.
- **Tinted, layered shadow scale** (carry the indigo hue, never pure black):
  xs/sm/md/lg/xl. Light: low-opacity indigo-tinted. Dark: deeper drop + subtle
  `inset 0 1px 0 oklch(1 0 0 / 0.04)` top highlight on elevated surfaces. Optional glass
  (`backdrop-blur` + translucent surface + hairline) on the top bar and command palette only.

## Components (every one ships default/hover/focus/active/disabled/loading/error/empty)
- **Button**: solid primary (subtle gradient sheen optional), secondary, outline, ghost,
  destructive. Hover = lift (−1px) + shadow step; active = scale 0.98; visible focus ring
  (2px primary @ 50%). Loading = inline spinner + disabled.
- **Card**: surface bg, hairline border, `shadow-sm` resting → `shadow-md` on interactive hover.
  No nested cards.
- **Input/Select/Textarea**: consistent height, hairline border → primary ring on focus, clear
  error (danger border + helper text).
- **Badge/Chip**: soft semantic fills above; status/priority always icon+label.
- **Table**: sticky header, zebra-free with hairline row dividers, hover row tint, selected-row
  state, density toggle, skeleton rows; pagination with page size + range.
- **Sidebar nav**: active = filled tint + left accent bar + primary icon; hover = subtle tint.
- **Top bar**: global search / ⌘K trigger, notifications bell (unread dot), theme toggle, user menu.
- **Empty states**: icon + one-line teach + primary action. **Loading**: skeletons.
- **Command palette** (cmdk, ⌘K) and **Kanban board** (dnd-kit, drag-to-transition) use these tokens.

## Motion (GSAP, `useGSAP`; conveys state, never decorative)
- Durations: fast 120ms · base 180ms · slow 240ms. Easing ease-out-quart `cubic-bezier(0.22,1,0.36,1)`.
- Micro-interactions: button press/hover lift, focus ring, row hover, chip add/remove.
- Meaningful reveals only: dashboard stat stagger + number count-up on first mount; toast/panel
  slide; board card drag. **No orchestrated full-page load sequences.**
- `prefers-reduced-motion`: every animation has an instant/crossfade fallback (global block in
  `index.css` + guards in motion hooks).

## Iconography
Lucide, 1.75px stroke, sizes 16/18/20. Consistent metaphors; never emoji as icons.

## Anti-patterns (hard bans)
AI-purple mesh background; glass on every card; gratuitous/looping motion; display fonts in
labels/data; reinvented scrollbars/controls; full-saturation accents on inactive states;
color-only status; nested cards; modal-first for inline-able tasks; pure-black dark mode.
