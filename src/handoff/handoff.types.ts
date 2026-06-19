// Claims expected in the signed hand-off token minted by a portal's backend.
export interface HandoffClaims {
  platformKey: string;   // which portal issued this
  portalUserId: string;  // stable id of the user within that portal
  name: string;
  email: string;
  iat?: number;
  exp?: number;
}

// The verified context attached to the request after the guard runs.
export interface HandoffContext {
  platformId: string;
  platformKey: string;
  reporter: {
    portalUserId: string;
    name: string;
    email: string;
  };
}
