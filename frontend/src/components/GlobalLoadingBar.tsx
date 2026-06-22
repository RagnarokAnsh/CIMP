import { useIsFetching, useIsMutating } from '@tanstack/react-query';

// A thin top progress bar shown whenever any query is fetching or any mutation
// is in flight (TanStack Query activity) — an app-wide "something's loading" cue,
// like GitHub/YouTube. Purely visual; no layout shift (fixed, pointer-none).
export function GlobalLoadingBar() {
  const active = useIsFetching() + useIsMutating();
  if (active === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/15"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="cimp-loading-bar h-full w-1/4 rounded-full bg-primary" />
    </div>
  );
}
