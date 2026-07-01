import { useMutation } from '@tanstack/react-query';
import { LifeBuoy } from 'lucide-react';
import { toast } from 'sonner';
import { staffApi } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Opens the reporter intake for THIS platform. We mint a hand-off token
// server-side, then deliver it to the reporter surface exactly like a portal
// would (?handoff=...). The tab is opened synchronously on click so popup
// blockers don't eat it, then redirected once the token is minted.
export function SupportButton() {
  const mint = useMutation({
    mutationFn: async () =>
      (await staffApi.post<{ token: string; platformKey: string }>('/staff/support/handoff')).data,
  });

  const onClick = () => {
    const win = window.open('about:blank', '_blank');
    mint.mutate(undefined, {
      onSuccess: ({ token }) => {
        const url = `/reporter/new?handoff=${encodeURIComponent(token)}`;
        if (win) win.location.href = url;
        else window.location.href = url; // popup blocked — fall back to same tab
      },
      onError: (e: any) => {
        win?.close();
        toast.error(e?.response?.data?.message ?? 'Could not open support.');
      },
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={onClick}
      disabled={mint.isPending}
      title="Report an issue about this platform"
    >
      {mint.isPending ? <Spinner /> : <LifeBuoy className="h-4 w-4" />}
      <span className="hidden sm:inline">Get support</span>
    </Button>
  );
}
