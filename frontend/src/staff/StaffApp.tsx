import { useAuth } from 'react-oidc-context';
import { LifeBuoy, Loader2 } from 'lucide-react';
import { StaffAuthProvider, oidcConfigured, useBindStaffToken } from './auth';
import { StaffLayout } from './StaffLayout';
import { StaffWorkspaceRoutes } from './routes';
import { DevStaffApp, devAuthEnabled } from './dev-auth';
import { LocalStaffApp, localAuthEnabled } from './local-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

export function StaffApp() {
  // Dev shim takes precedence for local testing without an IdP.
  if (devAuthEnabled) return <DevStaffApp />;

  // Self-issued JWT (password) login — no external IdP.
  if (localAuthEnabled) return <LocalStaffApp />;

  if (!oidcConfigured) {
    return (
      <CenteredCard>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" /> Staff workspace
          </CardTitle>
          <CardDescription>Single sign-on is not configured for this environment.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>OIDC not configured</AlertTitle>
            <AlertDescription>
              Set <code className="font-mono">VITE_OIDC_AUTHORITY</code> and{' '}
              <code className="font-mono">VITE_OIDC_CLIENT_ID</code> in{' '}
              <code className="font-mono">frontend/.env</code> to enable staff login.
            </AlertDescription>
          </Alert>
        </CardContent>
      </CenteredCard>
    );
  }
  return (
    <StaffAuthProvider>
      <StaffGate />
    </StaffAuthProvider>
  );
}

function StaffGate() {
  const auth = useAuth();
  useBindStaffToken();

  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Signing in…
      </div>
    );
  }

  if (auth.error) {
    return (
      <CenteredCard>
        <CardHeader>
          <CardTitle>Sign-in failed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive"><AlertDescription>{auth.error.message}</AlertDescription></Alert>
          <Button onClick={() => auth.signinRedirect()}>Try again</Button>
        </CardContent>
      </CenteredCard>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <CenteredCard>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" /> Staff workspace
          </CardTitle>
          <CardDescription>Sign in with your organization account to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => auth.signinRedirect()}>Sign in with SSO</Button>
        </CardContent>
      </CenteredCard>
    );
  }

  return (
    <StaffLayout onSignOut={() => auth.signoutRedirect()}>
      <StaffWorkspaceRoutes />
    </StaffLayout>
  );
}
