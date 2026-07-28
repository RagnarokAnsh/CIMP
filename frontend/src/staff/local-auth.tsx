import { useEffect, useState } from 'react';
import axios from 'axios';
import { Eye, EyeOff, LifeBuoy } from 'lucide-react';
import {
  STAFF_TOKEN_STORAGE_KEY, setStaffTokenGetter, setStaffUnauthorizedHandler,
} from '@/api/client';
import { friendlyError } from '@/lib/api-error';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDocumentTitle } from '@/lib/use-document-title';
import { StaffLayout } from './StaffLayout';
import { StaffWorkspaceRoutes } from './routes';

// Self-issued JWT (email/password) login — the only staff auth. No external IdP.
// The key is defined in api/client.ts because the request interceptor reads the
// same slot as a fallback (see currentStaffToken there for why).
const TOKEN_KEY = STAFF_TOKEN_STORAGE_KEY;

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
  useDocumentTitle('Sign in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    } catch (err) {
      setError(friendlyError(err, 'Sign-in failed. Please try again.'));
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h1" className="flex items-center gap-2 text-xl">
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
              {/* Reveal toggle: passwords here are admin-set rather than chosen,
                  so they are typed from a message or a password manager and
                  mistyped often. Nothing on this screen let you check. */}
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={pending || !email || !password}>
              {pending && <Spinner />}
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
            {/* There is no self-service reset — an admin sets passwords — so
                the screen has to say who to ask. It previously offered a locked
                -out user nothing actionable at all. */}
            <p className="text-center text-xs text-muted-foreground">
              Forgotten your password? Ask a workspace admin to set a new one for you.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
