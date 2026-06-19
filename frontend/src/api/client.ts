import axios from 'axios';
import { getHandoffToken } from './handoff';

// Reporter API: authenticated by the portal hand-off token.
export const reporterApi = axios.create({ baseURL: '/api/reporter' });
reporterApi.interceptors.request.use((config) => {
  const token = getHandoffToken();
  if (token) config.headers['X-Handoff-Token'] = token;
  return config;
});

// Staff API: authenticated by an OIDC bearer token. The token getter is set
// once the auth provider is ready (see staff/auth.tsx).
let staffTokenGetter: () => string | undefined = () => undefined;
export function setStaffTokenGetter(fn: () => string | undefined): void {
  staffTokenGetter = fn;
}

export const staffApi = axios.create({ baseURL: '/api' });
staffApi.interceptors.request.use((config) => {
  const token = staffTokenGetter();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
