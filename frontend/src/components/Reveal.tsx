import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

// A restrained, one-time entrance for a group of elements: quick fade-up with a
// small stagger. Kept fast (per the product register, users are in a task, not
// watching a page load) and disabled under prefers-reduced-motion.
export function Reveal({
  children,
  className,
  selector = ':scope > *',
}: {
  children: React.ReactNode;
  className?: string;
  selector?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const targets = ref.current?.querySelectorAll(selector);
      if (!targets || targets.length === 0) return;
      gsap.from(targets, {
        opacity: 0,
        y: 12,
        duration: 0.35,
        ease: 'power2.out',
        stagger: 0.05,
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
