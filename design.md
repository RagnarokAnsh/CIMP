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
- foreground `oklch(0.21 0.02 265)` · muted-foreground `oklch(0.515 0.02 265)`
- border `oklch(0.87 0.006 265)` · **input `oklch(0.66 0.02 265)`**
- sidebar `oklch(0.97 0.006 265)` · sidebar-border `oklch(0.86 0.006 265)`

### Neutrals — Dark
- background `oklch(0.17 0.015 265)` · surface/card `oklch(0.21 0.016 265)` · elevated `oklch(0.25 0.016 265)`
- foreground `oklch(0.97 0.005 265)` · muted-foreground `oklch(0.71 0.012 265)`
- border `oklch(1 0 0 / 12%)` · **input `oklch(1 0 0 / 36%)`**
- sidebar `oklch(0.15 0.016 265)` · sidebar-border `oklch(1 0 0 / 10%)`

### `--border` vs `--input` — two tokens, two obligations
`--border` is **decorative**: row dividers, card edges, hairlines. It only has to be visible.

`--input` is the **boundary of a form control**, which is a UI component under WCAG 1.4.11 and
must clear **3:1** against the field behind it. Use it on Input, Select, Textarea, Checkbox —
anything a user operates.

> One token served both until 2026-07-27, at which point every field in the product measured
> 1.41:1 light / 1.52:1 dark, i.e. was effectively borderless. Splitting them is why `--input`
> is so much darker than it looks like it "should" be — that darkness is the requirement.
> Note also that ~40 uses of `border-border/60` cut an already-thin line by a further 40%;
> prefer the full-strength token.

### Accents
- **primary (indigo)** — light `oklch(0.52 0.20 264)`, dark `oklch(0.67 0.17 264)`; fg `oklch(0.99 0 0)`
- **secondary accent (teal)** — light `oklch(0.70 0.13 195)`, dark `oklch(0.76 0.12 195)`
- **brand gradient** — light `linear-gradient(135deg, oklch(0.53 0.20 264), oklch(0.555 0.20 295))`,
  dark `…oklch(0.55 0.20 264), oklch(0.575 0.20 295)`. Hero surfaces only: sidebar brand lockup,
  dashboard hero, occasional primary CTA. Deliberately **not** a background-everywhere mesh.

  > Both stops are held **below the lightness at which white text drops under 4.5:1**, because
  > this gradient carries the whole dashboard hero. It previously measured 4.09/3.79 in dark.
  > Text on it must be **solid white** — the `text-white/80` and `/70` that were in use failed
  > in both themes, and the translucency bought nothing the gradient wasn't already giving.

### Semantic (AA in both themes; always paired with a label/icon, never color alone)
Lightness is set by the **worst-case job each token has**, solved against white rather than
picked by eye. success/info/danger carry white text on a solid fill (4.5:1); warning and
accent-2 carry a dark foreground and also serve as meter fills and icons (3:1 non-text).

| Token | Light | Dark | Use |
|---|---|---|---|
| success | `oklch(0.53 0.15 155)` | `oklch(0.72 0.15 158)` | resolved, positive |
| warning | `oklch(0.64 0.14 70)` | `oklch(0.80 0.15 80)` | in-progress, caution |
| danger | `oklch(0.56 0.22 25)` | `oklch(0.68 0.20 25)` | critical, destructive |
| info | `oklch(0.54 0.16 245)` | `oklch(0.70 0.14 240)` | new, neutral-info |

> The light column was re-solved on 2026-07-27. The original values were tuned in dark mode
> and never re-measured in light, where they came in at 2.49–4.10. Dark was already correct
> and is unchanged.

Soft badge fills: tinted background + saturated text + hairline border, tuned per theme
(darker text on light tint in light mode; `color/15` fill + `-300/-400` text in dark).
These live in `BADGE_TONE` / `BANNER_TONE` in `lib/issue-meta.ts` — **never re-roll them
per component**; that drift is what produced the 1.7–3.5 ratios the tones exist to prevent.
`tests/e2e/design-tokens.spec.ts` measures every tone in both themes and fails on drift.

### Status / Priority mapping
- Status — NEW = info · IN_PROGRESS = warning · ON_HOLD = slate-500 · RESOLVED = success ·
  CLOSED = zinc · REOPENED = **rose**.
- Priority — LOW = slate · MEDIUM = info · HIGH = orange · CRITICAL = danger.

> REOPENED was violet until 2026-07-27. Under simulated deuteranopia violet and blue differ
> by ΔE 1.1 — the same colour — so REOPENED and NEW were indistinguishable to ~8% of men.
> No violet or purple can fix this (blue and violet share the axis dichromats lose). The six
> dots are solved as a set for worst-case pairwise ΔE across normal, deuteranope and
> protanope vision: **20.4**, from 1.1. Re-run the solver before changing any of them.

### Charts
`--chart-1` indigo · `-2` teal · `-3` emerald · `-4` amber · `-5` rose.

Two constraints, both enforced by measurement:
- **≥3:1 against the plot surface** in each theme (chart marks are non-text content).
- **Staggered lightness.** Hue separation alone is not enough — the series were within 24
  points of greyscale luminance and collapsed in print and on monochrome displays. Lightness
  now steps in even intervals: minimum gap 4.7pp light, 9.1pp dark (was 1.8pp).

Hue separation is CVD-safe: every pair clears ΔE 11 under deuteranopia and protanopia.

## Typography
- One family: **Geist** (sans) + **Geist Mono** (references, IDs, numeric data). Load via
  `@fontsource-variable/geist` + `@fontsource-variable/geist-mono` (no external CDN). System fallback.
- **Fixed rem scale**, defined as `--text-*` tokens in `index.css` `@theme`:

  | Utility | Size | Used for |
  |---|---|---|
  | `text-2xs` | 0.6875rem / 11px | **hard floor** — key hints, reference numbers, avatar initials |
  | `text-xs` | 0.75rem / 12px | metadata, captions, helper text |
  | `text-sm` | 0.875rem / 14px | **working base** — body copy, table cells, all control text |
  | `text-base` | 1rem / 16px | emphasised body |
  | `text-lg` | 1.125rem / 18px | card titles |
  | `text-xl` | 1.375rem / 22px | issue titles, reporter page titles |
  | `text-2xl` | 1.75rem / 28px | page `h1` |
  | `text-3xl` | 2.25rem / 36px | KPI figures |
  | `text-4xl` | 3rem / 48px | display |

  > This block did not exist until 2026-07-27, so Tailwind's default 16px-base scale was
  > silently in force and every documented size was off by 2–6px. Note `text-sm` (14px), not
  > `text-base`, is the product's working base — that is what body copy and controls actually
  > use, and it is the 14px the dense-UI rationale asks for.
- **No arbitrary sizes.** `text-[10px]` and friends are banned; 11px is the floor and it has a
  token. Nineteen such values had accumulated, several carrying real content.
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

### Focus: one ring, everywhere
`.focus-ring` in `index.css` — 2px `--ring` at 60%, **with a 2px offset**. Use
`.focus-ring-surface` for controls sitting on a card/popover so the offset gap matches what is
actually behind them. Never hand-roll a `focus-visible:ring-*` stack.

> There were three competing recipes and only 3 of 20+ declarations carried an offset, so most
> rings sat flush on the control edge and read as a border change rather than a focus indicator.

### Control geometry
Heights come from the `size` variant: `default` h-9, `sm` h-8, `lg` h-10. **One height per
toolbar** — Button, Select and Toggle all offer both, and Input is h-9 only, so a row built
around text inputs is an h-9 row and its buttons must be told so explicitly.

- **Button**: solid primary, gradient, secondary, outline, ghost, destructive. Hover = lift
  (−1px) + shadow step; active = scale 0.98. Loading = inline spinner + disabled. A disabled
  control must state *why* somewhere visible — **never in a `title`**, which never fires on a
  `pointer-events:none` element (this silently hid the staff lockout reason).
- **Card**: surface bg, hairline border, `shadow-sm` resting → `shadow-md` on interactive hover.
  No nested cards. `CardTitle` renders a **real heading** (`h3` by default, `as` to override) —
  it is the section title for almost every panel in the product, so a `<div>` there empties the
  document outline.
- **Kbd** (`ui/kbd.tsx`): the only way to render a key. `aria-hidden` by default, since a hint
  beside a labelled control is noise; pass `aria-hidden={false}` in a shortcut list.
- **Selection marker**: 4px (`w-1`) left bar + tint. Same measure in the sidebar and in list rows.
- **Meters and progress bars** carry `role="progressbar"` + `aria-valuenow`, or are marked
  `aria-hidden` and defer to a text list beside them. A value in a `title` is not accessible.
- **Bar charts** encode one denominator. If the label says "38% of total", the bar is 38% of the
  track — not 100% because that row happens to be the largest.
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

## Layout tokens
- `--workspace-chrome` (14rem): vertical space the staff chrome occupies above a full-height
  pane. The issues split view and the board track both subtract it from `100vh`. They each
  hard-coded their own guess (15rem and 13rem) before this existed, so they disagreed by 2rem
  and neither tracked a change to the chrome.
- **Stacking ladder** — `.z-sticky` 20 (in-page sticky toolbars) · `.z-header` 30 (app chrome) ·
  `.z-overlay` 50 (Radix portals) · `.z-progress` 100 (global loading bar). No bare `z-[n]`.

## Accessibility floor
Non-negotiable, and all of these were once missing:
- A **skip link** as the first focusable element of any persistent-nav layout.
- Every route sets `document.title` (`useDocumentTitle`) — WCAG 2.4.2.
- Every `<nav>` is named; every icon-only control has an `aria-label`.
- Any clipped/scrollable region is focusable (`tabIndex={0}` + `role="region"` + a label).
- No nested interactive elements. A card that opens something contains a **link**; it does not
  become a `role="button"` wrapping other buttons.
- Mutually exclusive options are a group with `aria-pressed`, not loose buttons.
- Status is never colour alone — always an icon or label too — and the *selected* state must
  look different from an *action*.

## Anti-patterns (hard bans)
AI-purple mesh background; glass on every card; gratuitous/looping motion; display fonts in
labels/data; reinvented scrollbars/controls; full-saturation accents on inactive states;
color-only status; nested cards; modal-first for inline-able tasks; pure-black dark mode;
raw palette values (`bg-emerald-500`) outside `issue-meta.ts` / `status-meta.ts`; arbitrary
type sizes; hand-rolled focus rings; enum values rendered to screen (`NOT_SYNCED`).
