// Renders an SDK diagnostics context (issue.context) read-only. Shared by the
// reporter's "what will be sent" dialog and the staff Diagnostics panel.
// Everything is untrusted reporter input — plain text rendering only.

const KNOWN_ARRAYS = ['consoleErrors', 'failedRequests', 'breadcrumbs'] as const;

function EnvTable({ ctx }: { ctx: Record<string, unknown> }) {
  const rows = Object.entries(ctx).filter(
    ([k, v]) => !KNOWN_ARRAYS.includes(k as any) && (typeof v !== 'object' || v === null || k === 'viewport' || k === 'extra'),
  );
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-all font-mono">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DiagnosticsView({ context }: { context: Record<string, unknown> }) {
  const consoleErrors = Array.isArray(context.consoleErrors) ? context.consoleErrors : [];
  const failedRequests = Array.isArray(context.failedRequests) ? context.failedRequests : [];
  const breadcrumbs = Array.isArray(context.breadcrumbs) ? context.breadcrumbs : [];

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Environment</h4>
        <EnvTable ctx={context} />
      </section>

      {consoleErrors.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Console errors ({consoleErrors.length})
          </h4>
          <ul className="space-y-1">
            {consoleErrors.map((e, i) => (
              <li key={i} className="break-all rounded bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive">
                {String(e)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {failedRequests.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Failed requests ({failedRequests.length})
          </h4>
          <ul className="space-y-1">
            {failedRequests.map((r: any, i) => (
              <li key={i} className="break-all font-mono text-xs">
                <span className="font-semibold">{String(r?.method ?? '?')}</span>{' '}
                {String(r?.url ?? '?')}{' '}
                <span className="text-destructive">→ {r?.status ?? 'network error'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {breadcrumbs.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Route history</h4>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {breadcrumbs.map((b: any) => String(b?.path ?? '?')).join(' → ')}
          </p>
        </section>
      )}
    </div>
  );
}
