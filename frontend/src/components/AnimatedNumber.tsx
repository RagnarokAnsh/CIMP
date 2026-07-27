import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

// Counts up to `value` on mount. The motion conveys "this is live data settling
// in" — purposeful, not decorative. Honors prefers-reduced-motion by snapping to
// the final value.
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  // The value the last tween finished on. The count-up used to start from 0
  // every time `value` changed, not just on mount — so with SSE keeping the
  // dashboard live, a KPI dropped to zero and climbed back for 0.9s on every
  // update, which reads as data loss rather than data arriving.
  const from = useRef(0);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced || from.current === value) {
        el.textContent = String(value);
        from.current = value;
        return;
      }
      const obj = { n: from.current };
      // Only the first mount gets the full settling animation; later updates
      // are a short tween between two real numbers.
      const firstRun = from.current === 0;
      gsap.to(obj, {
        n: value,
        duration: firstRun ? 0.9 : 0.35,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = String(Math.round(obj.n));
        },
        onComplete: () => {
          from.current = value;
        },
      });
    },
    { dependencies: [value] },
  );

  // aria-live so an updating figure is announced once it settles, and
  // suppressReedingWarning because GSAP writes textContent outside React.
  return (
    <span ref={ref} className={className} aria-live="polite" suppressHydrationWarning>
      {value}
    </span>
  );
}
