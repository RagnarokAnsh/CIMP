import { useEffect, useState } from 'react';
import axios from 'axios';
import { LifeBuoy } from 'lucide-react';
import { setStaffTokenGetter, setStaffUnauthorizedHandler } from '@/api/client';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StaffLayout } from './StaffLayout';
import { StaffWorkspaceRoutes } from './routes';

// Self-issued JWT (email/password) login — the only staff auth. No external IdP.
const TOKEN_KEY = 'staff_token';

// Holds the stored token; the getter is registered from the component (see
// below) so the dev/local/OIDC modules never clobber each other's getter at
// import time.
let currentToken: string | null = sessionStorage.getItem(TOKEN_KEY);

export function LocalStaffApp() {
  const [token, setToken] = useState<string | null>(currentToken);

  // Register the token getter during render (not an effect) so it's active
  // before child query effects fire — only the mounted staff app sets this.
  setStaffTokenGetter(() => currentToken ?? undefined);

  const setSession = (t: string | null) => {
    currentToken = t;
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
    setToken(t);
  };

  // Sign out (return to the login form) when the API rejects the token.
  useEffect(() => {
    setStaffUnauthorizedHandler(() => setSession(null));
    return () => setStaffUnauthorizedHandler(() => {});
  }, []);

  if (!token) return <LoginForm onLogin={setSession} />;

  return (
    <StaffLayout onSignOut={() => setSession(null)}>
      <StaffWorkspaceRoutes />
    </StaffLayout>
  );
}

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { data } = await axios.post<{ accessToken: string }>('/api/auth/login', {
        email: email.trim(),
        password,
      });
      onLogin(data.accessToken);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Sign-in failed. Please try again.');
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" /> Staff workspace
          </CardTitle>
          <CardDescription>Sign in with your support account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            {error && (
              <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending || !email || !password}>
              {pending && <Spinner />}
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
