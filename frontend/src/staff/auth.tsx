import { useEffect } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { setStaffTokenGetter, setStaffUnauthorizedHandler } from '../api/client';

const oidcConfig = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY ?? '',
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID ?? '',
  redirect_uri: import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/staff`,
  scope: import.meta.env.VITE_OIDC_SCOPE ?? 'openid profile email',
};

export const oidcConfigured = Boolean(oidcConfig.authority && oidcConfig.client_id);

export function StaffAuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthProvider {...oidcConfig}>{children}</AuthProvider>;
}

// Keeps the axios staff client's bearer token in sync with the OIDC session, and
// signs the user out when the API rejects the token (401).
export function useBindStaffToken() {
  const auth = useAuth();
  useEffect(() => {
    setStaffTokenGetter(() => auth.user?.access_token);
  }, [auth.user?.access_token]);
  useEffect(() => {
    setStaffUnauthorizedHandler(() => {
      void auth.removeUser();
    });
    return () => setStaffUnauthorizedHandler(() => {});
  }, [auth]);
}
