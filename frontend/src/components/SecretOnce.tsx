import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

function copy(value: string) {
  void navigator.clipboard.writeText(value);
  toast.success('Copied to clipboard.');
}

/** Inline copy-once banner, shown after minting an API token or webhook secret. */
export function SecretOnce({ label, value }: { label: string; value: string }) {
  return (
    <Alert>
      <AlertTitle>{label} — shown only once</AlertTitle>
      <AlertDescription className="flex items-center gap-2">
        <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{value}</code>
        <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => copy(value)}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Modal variant for a secret the operator MUST capture before moving on —
 * currently the rotated hand-off signing key.
 *
 * Rotation used to drop the new key into a 12-second toast: not selectable,
 * not re-viewable, and if you missed it that portal's hand-off stayed broken
 * until you rotated again. A dialog that only closes on an explicit
 * acknowledgement removes that failure mode.
 */
export function SecretOnceDialog({
  value,
  title,
  description,
  onClose,
}: {
  /** The secret; null keeps the dialog closed. */
  value: string | null;
  title: string;
  description: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog open={value !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1"
            onClick={() => value && copy(value)}
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>I&apos;ve saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
