// Row-action icon buttons. These are bare <button> elements rather than the
// <Button> component because they are passed as `trigger` slots into
// ConfirmDialog/AlertDialog, which clones the child — a nested <Button> would
// double the styling. The class strings lived in two admin pages in duplicate;
// they are one definition now so the destructive affordance cannot drift
// between the integrations page and the status page.

const BASE = 'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground '
  + 'transition-colors focus-ring';

export const DESTRUCTIVE_ICON = `${BASE} hover:bg-destructive/10 hover:text-destructive`;

export const NEUTRAL_ICON = `${BASE} hover:bg-accent hover:text-foreground`;
