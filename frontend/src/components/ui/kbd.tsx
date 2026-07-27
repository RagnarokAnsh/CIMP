import { cn } from "@/lib/utils"

/**
 * A keyboard key.
 *
 * There were three treatments in the app: the top bar's bordered chip, Triage's
 * bare `text-2xs text-muted-foreground`, and Triage's help bar using a raw
 * `<kbd>` with no classes at all, which fell back to the browser's default
 * monospace. One component, one look.
 *
 * `aria-hidden` by default: a key hint sits next to a control whose label
 * already says what it does, so announcing "Assign to me a" adds noise rather
 * than information. Pass `aria-hidden={false}` for a standalone shortcut list
 * where the key IS the content.
 */
function Kbd({
  className,
  "aria-hidden": ariaHidden = true,
  ...props
}: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      aria-hidden={ariaHidden}
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-2xs font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
