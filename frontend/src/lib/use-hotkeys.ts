import { useEffect } from 'react';

// Single-key shortcuts that NEVER fire while the user is typing (inputs,
// textareas, selects, contenteditable) or while any dialog is open, and ignore
// chords with modifiers (those belong to the browser / command palette).
export function useHotkeys(map: Record<string, () => void>, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target
        && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      ) return;
      // Radix keeps open dialogs stamped with data-state — shortcuts stay dead
      // while any modal (merge dialog, palette, …) is up.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const fn = map[e.key.toLowerCase()];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map, enabled]);
}
