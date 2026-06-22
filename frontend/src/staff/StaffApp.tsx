import { LocalStaffApp } from './local-auth';

// Staff workspace auth: self-issued JWT (email/password) — the only staff auth.
export function StaffApp() {
  return <LocalStaffApp />;
}
