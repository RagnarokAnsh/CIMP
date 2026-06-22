import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Standard inline spinner. Use inside buttons or beside text.
export function Spinner({ className, ...props }: React.ComponentProps<typeof Loader2>) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden {...props} />;
}

// Centered spinner for filling a panel/area while its content loads.
export function CenteredSpinner({
  label, className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-40 flex-col items-center justify-center gap-2 text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="h-6 w-6 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
