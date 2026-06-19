// Shared motion constants so animation feels consistent and intentional across
// the app (see DESIGN.md → Motion). Ease-out, short durations; motion conveys
// state, never decorates.

export const EASE_OUT = 'power3.out';

export const DUR = {
  fast: 0.12,
  base: 0.18,
  slow: 0.24,
} as const;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Custom event the top-bar search trigger and ⌘K shortcut both dispatch; the
// command palette (Phase 3) listens for it.
export const COMMAND_EVENT = 'cimp:open-command';

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(COMMAND_EVENT));
}
