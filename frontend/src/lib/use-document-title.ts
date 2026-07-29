import { useEffect } from 'react';

const SUFFIX = 'Support';

/**
 * Sets `document.title` for the current route.
 *
 * Nothing did this before, so every route in the product — dashboard, board, an
 * individual issue, admin, and the public `/status/:key` page — shared the
 * static "Support Platform" from index.html. Tabs were indistinguishable,
 * history and bookmarks were useless, and a screen reader announced the same
 * page title on every navigation (WCAG 2.4.2, Level A).
 *
 * Pass `null` while the data a title depends on is still loading; the title is
 * left alone rather than flashing a placeholder, and set once the data arrives.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · ${SUFFIX}`;
    // Restore on unmount so a route that unmounts without a replacement (a
    // modal route, an error boundary) doesn't strand its title in the tab.
    return () => { document.title = previous; };
  }, [title]);
}
