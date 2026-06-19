import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

// Counts up to `value` on mount. The motion conveys "this is live data settling
// in" — purposeful, not decorative. Honors prefers-reduced-motion by snapping to
// the final value.
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) {
        el.textContent = String(value);
        return;
      }
      const obj = { n: 0 };
      gsap.to(obj, {
        n: value,
        duration: 0.9,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = String(Math.round(obj.n));
        },
      });
    },
    { dependencies: [value] },
  );

  return <span ref={ref} className={className}>{value}</span>;
}
