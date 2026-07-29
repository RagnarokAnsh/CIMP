import { useState, type ReactNode } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Confirmation gate for destructive actions. Every delete/revoke in the staff
 * workspace goes through this — previously they fired on a single click with no
 * undo path.
 *
 * Pass `confirmPhrase` for the irreversible ones (deleting a platform or a staff
 * account): the confirm button stays disabled until the operator types that
 * exact string, which makes "wrong row" mistakes essentially impossible.
 *
 * Two modes:
 * - **Uncontrolled** — pass `trigger`; the dialog owns its open state.
 * - **Controlled** — pass `open`/`onOpenChange` and no trigger. Use this when
 *   the action lives in a dropdown menu: the dialog must render OUTSIDE the
 *   menu, or closing the menu unmounts it mid-flight, and a menu left open
 *   afterwards marks the rest of the page `aria-hidden`.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmPhrase,
  variant = 'destructive',
  disabled,
  open: controlledOpen,
  onOpenChange: onControlledOpenChange,
  onConfirm,
}: {
  trigger?: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  /** When set, the operator must type this exactly before confirming. */
  confirmPhrase?: string;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  /** Controlled mode: supply both, and omit `trigger`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  // Reset the typed phrase on every open so a previous attempt never carries
  // over and pre-arms the button.
  const onOpenChange = (next: boolean) => {
    if (next) setTyped('');
    if (isControlled) onControlledOpenChange?.(next);
    else setUncontrolledOpen(next);
  };

  const armed = !disabled && (!confirmPhrase || typed === confirmPhrase);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <span onClick={(e) => { e.stopPropagation(); if (!disabled) onOpenChange(true); }}>
          {trigger}
        </span>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {confirmPhrase && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-phrase">
              Type <code className="rounded bg-muted px-1 py-0.5 text-xs">{confirmPhrase}</code> to confirm
            </Label>
            <Input
              id="confirm-phrase"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmPhrase}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            disabled={!armed}
            onClick={(e) => {
              if (!armed) { e.preventDefault(); return; }
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
