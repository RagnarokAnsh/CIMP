import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A collapsible section built on native `<details>`.
 *
 * Issue detail had two of these within a few hundred pixels of each other —
 * Diagnostics as a bare `rounded-lg border-border/60`, Known issue as a
 * `Card py-0` with hand-tuned padding to undo the Card's own. Same interaction,
 * same column, two different containers, because each was built on its own.
 *
 * Native `<details>` is deliberate: it is keyboard-operable, announces its
 * expanded state, and survives Ctrl+F without any JavaScript.
 */
function Disclosure({
  summary,
  badge,
  icon,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"details">, "title"> & {
  /** The always-visible row. */
  summary: React.ReactNode
  /** Optional status chip rendered after the summary text. */
  badge?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <details
      data-slot="disclosure"
      className={cn("group rounded-lg border border-border bg-card", className)}
      {...props}
    >
      <summary className="focus-ring-surface flex cursor-pointer select-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold">
        {icon}
        {summary}
        {badge}
        <ChevronDown
          className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3">{children}</div>
    </details>
  )
}

export { Disclosure }
