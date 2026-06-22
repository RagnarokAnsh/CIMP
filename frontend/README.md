# Support Platform — Frontend

React + TypeScript + Vite SPA. Server state via **TanStack Query**, tables via
**TanStack Table**, UI via **shadcn/ui** (Radix + Tailwind v4, new-york style,
dark by default). Routing via React Router.

Two surfaces:

- **Reporter** (`/reporter/*`) — the two-field intake + "My issues" list/detail.
  Embedded in portals; authenticated by the hand-off token, which it captures
  from a `?handoff=` query param or a `postMessage({ type: 'handoff', token })`
  and sends as `X-Handoff-Token` on every request. No login UI.
- **Staff** (`/staff/*`) — email/password login (self-issued JWT; the token is
  stored and sent as `Authorization: Bearer …`), then the issue list (filters +
  search + CSV export), issue detail (status transitions, priority, comments with
  an internal / reporter-visible toggle, audit history), dashboard, and admin
  screens (platforms, staff/roles). UI is gated by role for UX; the **server is
  the real enforcement point**.

## Run

```bash
cp .env.example .env        # no auth config needed; set VITE_PORTAL_ORIGINS only
                            # if portals deliver the hand-off token via postMessage
npm install
npm run dev                 # http://localhost:5173 (proxies /api → :3000)
```

Start the backend (`npm run start:dev` in the repo root) first so `/api` resolves.

## Typed API client

The hand-written types in `src/api/types.ts` mirror the backend responses. To
generate a fully typed client from the live OpenAPI doc instead:

```bash
npm run gen:api             # writes src/api/schema.d.ts from /api/docs-json
```

## Components

shadcn components live in `src/components/ui/` (owned source — edit freely).
Add more with `npx shadcn@latest add <name>`. Design tokens are in
`src/index.css`; status/priority colors in `src/lib/issue-meta.ts`.
