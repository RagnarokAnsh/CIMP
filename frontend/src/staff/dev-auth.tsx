import { useEffect, useState } from 'react';
import axios from 'axios';
import { LifeBuoy, Loader2, ShieldAlert } from 'lucide-react';
import { setStaffTokenGetter } from '@/api/client';
import type { Role } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { StaffLayout } from './StaffLayout';
import { StaffWorkspaceRoutes } from './routes';

export const devAuthEnabled = import.meta.env.VITE_DEV_AUTH === 'true';

const TOKEN_KEY = 'dev_staff_token';

interface DevStaffUser {
  idpSubject: string;
  name: string;
  email: string;
  roles: { role: Role; platformId: string | null }[];
}

// Keep the axios staff client's bearer in sync with the stored dev token.
let currentToken: string | null = sessionStorage.getItem(TOKEN_KEY);
setStaffTokenGetter(() => currentToken ?? undefined);

export function DevStaffApp() {
  const [token, setToken] = useState<string | null>(currentToken);

  const setSession = (t: string | null) => {
    currentToken = t;
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
    setToken(t);
  };

  if (!token) return <DevLogin onLogin={setSession} />;

  return (
    <StaffLayout onSignOut={() => setSession(null)}>
      <DevModeBanner />
      <StaffWorkspaceRoutes />
    </StaffLayout>
  );
}

function DevModeBanner() {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-500">
      <ShieldAlert className="h-3.5 w-3.5" />
      Dev auth is active — OIDC is bypassed. Do not enable this in production.
    </div>
  );
}

function roleLabel(roles: DevStaffUser['roles']): string {
  if (roles.length === 0) return 'No roles';
  return roles
    .map((r) => `${r.role.replace('_', ' ')}${r.platformId ? '' : ' (global)'}`)
    .join(', ');
}

function primaryRole(roles: DevStaffUser['roles']): Role | 'NONE' {
  if (roles.some((r) => r.role === 'ADMIN')) return 'ADMIN';
  if (roles.some((r) => r.role === 'DEVELOPER')) return 'DEVELOPER';
  if (roles.some((r) => r.role === 'FOCAL_POINT')) return 'FOCAL_POINT';
  return 'NONE';
}

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'bg-primary/15 text-primary border-primary/20',
  DEVELOPER: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  FOCAL_POINT: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  NONE: 'text-muted-foreground',
};

function DevLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [users, setUsers] = useState<DevStaffUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get<DevStaffUser[]>('/api/auth/dev/users')
      .then((r) => setUsers(r.data))
      .catch(() => setError('Could not load staff. Is the backend running with DEV_AUTH=true?'));
  }, []);

  const signIn = async (idpSubject: string) => {
    setPending(idpSubject);
    setError(null);
    try {
      const { data } = await axios.post<{ accessToken: string }>('/api/auth/dev/login', { idpSubject });
      onLogin(data.accessToken);
    } catch {
      setError('Sign-in failed.');
      setPending(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" /> Staff workspace
          </CardTitle>
          <CardDescription>
            Dev sign-in — pick a seeded account to explore the workspace with that role's scope.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!users && !error && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
            </div>
          )}

          {users?.map((u) => {
            const role = primaryRole(u.roles);
            return (
              <button
                key={u.idpSubject}
                onClick={() => signIn(u.idpSubject)}
                disabled={pending !== null}
                className="flex w-full items-center justify-between rounded-md border border-border p-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
              >
                <div>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{roleLabel(u.roles)}</div>
                </div>
                {pending === u.idpSubject ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Badge variant="outline" className={ROLE_BADGE[role]}>
                    {role.replace('_', ' ')}
                  </Badge>
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
