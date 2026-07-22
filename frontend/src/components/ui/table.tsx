import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Tracks whether a horizontally-scrollable box has content hidden to the left or
 * right, so an edge cue can be shown *only* when there is actually more to see.
 * A permanent fade would make every table on desktop look clipped.
 */
function useScrollEdges<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const [edges, setEdges] = React.useState({ start: false, end: false })

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const max = el.scrollWidth - el.clientWidth
      // 1px slack: fractional layout widths otherwise leave the cue stuck on.
      setEdges({ start: el.scrollLeft > 1, end: max > 1 && el.scrollLeft < max - 1 })
    }

    measure()
    el.addEventListener("scroll", measure, { passive: true })
    // Catches column-width changes (filtering, sidebar collapse) as well as
    // viewport resizes.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => {
      el.removeEventListener("scroll", measure)
      ro.disconnect()
    }
  }, [])

  return { ref, ...edges }
}

// The container scrolls when the table is wider than its column — routinely on a
// phone, where the issues table is ~940px in a ~356px box. Overlay scrollbars
// stay hidden until you scroll, so nothing signalled that Status / Assignee /
// Actions existed off-screen. The edge shadows say so, and tabIndex makes the
// region reachable (and arrow-key scrollable) by keyboard.
function Table({ className, ...props }: React.ComponentProps<"table">) {
  const { ref, start, end } = useScrollEdges<HTMLDivElement>()
  const scrollable = start || end

  return (
    <div className="relative w-full">
      <div
        ref={ref}
        data-slot="table-container"
        className="relative w-full overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        tabIndex={scrollable ? 0 : -1}
        role={scrollable ? "region" : undefined}
        aria-label={scrollable ? "Scrollable table" : undefined}
      >
        <table
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
      {/* A shadow, not a colour fade: the table may sit on `card` (white) or on
          `background`, and fading to either one is invisible against the other.
          Darkening works on every surface and in both themes. */}
      {start && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/12 to-transparent dark:from-black/45"
        />
      )}
      {end && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/12 to-transparent dark:from-black/45"
        />
      )}
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
