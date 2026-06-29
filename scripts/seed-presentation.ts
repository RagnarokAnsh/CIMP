import 'reflect-metadata';
import 'dotenv/config';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../src/data-source';
import {
  Attachment, AuditEvent, Comment, Issue, NotificationLog, Platform, Reporter,
  ReporterIssueView, SavedView, StaffUser, UserPlatformRole,
} from '../src/entities';
import {
  AccountStatus, ActorType, CommentVisibility, IssueStatus, JiraSyncStatus,
  NotificationChannel, NotificationStatus, Priority, PlatformStatus,
  RecipientType, Role, ScanStatus,
} from '../src/common/enums';

// ───────────────────────────────────────────────────────────────────────────
// PRESENTATION SEEDER  —  rich, demo-ready dataset for a client walkthrough.
//
//   npm run seed:presentation
//
// What it does:
//   • Connects with synchronize=false (safe for a migrated production DB — it
//     never touches the schema; the migrations must already be applied).
//   • WIPES every data table, then inserts a curated, internally-consistent
//     dataset: 4 portals, 10 staff covering the full RBAC matrix, 12 reporters,
//     ~32 issues across every status & priority, threaded comments (internal +
//     reporter-visible + reporter replies), attachments, a full audit trail,
//     notifications (so the staff bell shows unread), reporter "new update"
//     indicators, saved views, Jira-linked issues, and SLA overdue/at-risk work.
//   • Prints all login credentials and a ready-to-open reporter portal link.
//
// Everything is tuned to the real queries: notification recipient = staff id
// (so the bell lights up), issue dates fall inside the dashboard's 14-day
// window, and a few open issues are deliberately past their SLA window.
//
// Override the admin login (and other knobs) with env vars — see below.
// ───────────────────────────────────────────────────────────────────────────

// ---- config (override via env) --------------------------------------------

const ADMIN_NAME = process.env.ADMIN_NAME || 'Ananya Desai';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@demo.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
// Shared password for every non-admin demo staff account (focal points + devs).
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'demo1234';
// Public URL of the hosted frontend, used to build the reporter demo link.
// On your AWS box set APP_URL to e.g. http://<your-ip-or-domain> (no trailing /).
const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');

// ---- time helpers ----------------------------------------------------------

const NOW = new Date();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const daysAgo = (d: number, h = 0) => new Date(NOW.getTime() - d * DAY - h * HOUR);
const interp = (a: Date, b: Date, f: number) =>
  new Date(a.getTime() + f * (b.getTime() - a.getTime()));
const maxDate = (...ds: Date[]) => new Date(Math.max(...ds.map((d) => d.getTime())));
const byIdx = <T>(arr: T[], i: number): T => arr[i % arr.length];

// ---- static data: platforms ------------------------------------------------

const PLATFORMS = [
  { key: 'nimbus-crm', name: 'Nimbus CRM', domain: 'nimbus.example.com', jira: false, jiraKey: null as string | null },
  { key: 'vault-pay', name: 'Vault Pay', domain: 'vaultpay.example.com', jira: true, jiraKey: 'VAULT' },
  { key: 'shiftbridge-hr', name: 'ShiftBridge HR', domain: 'shiftbridge.example.com', jira: false, jiraKey: null },
  { key: 'cargopilot', name: 'CargoPilot Logistics', domain: 'cargopilot.example.com', jira: false, jiraKey: null },
];

// ---- static data: staff (the RBAC story) -----------------------------------

type StaffRole = { role: Role; platform: string | null };
type StaffSpec = { key: string; name: string; email: string; admin?: boolean; roles: StaffRole[] };

const STAFF: StaffSpec[] = [
  { key: 'admin', name: ADMIN_NAME, email: ADMIN_EMAIL, admin: true, roles: [{ role: Role.ADMIN, platform: null }] },
  { key: 'raj', name: 'Raj Malhotra', email: 'raj.global@demo.com', roles: [{ role: Role.DEVELOPER, platform: null }] },
  { key: 'wei', name: 'Wei Chen', email: 'wei.chen@demo.com', roles: [{ role: Role.FOCAL_POINT, platform: 'nimbus-crm' }] },
  { key: 'hannah', name: 'Hannah Kim', email: 'hannah.kim@demo.com', roles: [{ role: Role.DEVELOPER, platform: 'nimbus-crm' }] },
  { key: 'sofia', name: 'Sofia Marquez', email: 'sofia.marquez@demo.com', roles: [{ role: Role.FOCAL_POINT, platform: 'vault-pay' }] },
  { key: 'diego', name: 'Diego Santos', email: 'diego.santos@demo.com', roles: [{ role: Role.DEVELOPER, platform: 'vault-pay' }] },
  { key: 'omar', name: 'Omar Haddad', email: 'omar.haddad@demo.com', roles: [{ role: Role.FOCAL_POINT, platform: 'shiftbridge-hr' }] },
  { key: 'aisha', name: 'Aisha Bello', email: 'aisha.bello@demo.com', roles: [{ role: Role.DEVELOPER, platform: 'shiftbridge-hr' }] },
  { key: 'noah', name: 'Noah Schmidt', email: 'noah.schmidt@demo.com', roles: [{ role: Role.FOCAL_POINT, platform: 'cargopilot' }] },
  { key: 'mateo', name: 'Mateo Silva', email: 'mateo.silva@demo.com', roles: [{ role: Role.DEVELOPER, platform: 'cargopilot' }] },
];

// ---- static data: reporters (end users of each portal) ---------------------

type ReporterSpec = { key: string; platform: string; portalUserId: string; name: string };

const REPORTERS: ReporterSpec[] = [
  { key: 'priya', platform: 'nimbus-crm', portalUserId: 'u-2001', name: 'Priya Nair' },
  { key: 'tom', platform: 'nimbus-crm', portalUserId: 'u-2002', name: 'Tom Becker' },
  { key: 'lucia', platform: 'nimbus-crm', portalUserId: 'u-2003', name: 'Lucia Romano' },
  { key: 'daniel', platform: 'vault-pay', portalUserId: 'u-2101', name: 'Daniel Cohen' },
  { key: 'mei', platform: 'vault-pay', portalUserId: 'u-2102', name: 'Mei Lin' },
  { key: 'olu', platform: 'vault-pay', portalUserId: 'u-2103', name: 'Olu Adeyemi' },
  { key: 'sara', platform: 'shiftbridge-hr', portalUserId: 'u-2201', name: 'Sara Haugen' },
  { key: 'kwame', platform: 'shiftbridge-hr', portalUserId: 'u-2202', name: 'Kwame Mensah' },
  { key: 'elena', platform: 'shiftbridge-hr', portalUserId: 'u-2203', name: 'Elena Rossi' },
  { key: 'yuki', platform: 'cargopilot', portalUserId: 'u-2301', name: 'Yuki Tanaka' },
  { key: 'carlos', platform: 'cargopilot', portalUserId: 'u-2302', name: 'Carlos Mendes' },
  { key: 'fatima', platform: 'cargopilot', portalUserId: 'u-2303', name: 'Fatima Zahra' },
];

// ---- static data: auto-thread text pools -----------------------------------

const ACK = [
  "Thanks for flagging this — we've reproduced it on our side and are looking into it.",
  'Appreciate the report. We can see the issue and have routed it to engineering.',
  "Got it — confirmed on our end. We'll keep you posted here as we make progress.",
];
const NOTE = [
  'Traced to a regression in the last release. Preparing a targeted fix.',
  'Reproduced locally — root cause is in the shared service layer; patch in progress.',
  'Added logging to narrow this down; a candidate fix has been identified.',
];
const HOLD = [
  'Blocked on an upstream dependency — parking this until their fix lands.',
  'Waiting on a couple of extra details before we can safely proceed.',
  'On hold for the next maintenance window so we can deploy the change safely.',
];
const RES = [
  'This is fixed in today’s release. Please give it another try and let us know.',
  'We’ve deployed a fix — the behaviour should be back to normal now.',
  'Resolved and verified on our side. Reopen anytime if anything still looks off.',
];
const THANKS = [
  'Thanks, that’s working for us now.',
  'Confirmed fixed on our end — appreciate the quick turnaround.',
  'Looks good, thank you for the help.',
];
const REOPEN = [
  'We’re still seeing this intermittently — reopening.',
  'Unfortunately it came back after the latest update.',
  'This started happening again today; could you take another look?',
];
const REOPEN_NOTE = [
  "Reopened — the previous fix didn't cover this edge case. Investigating.",
  'Confirmed recurrence; digging into a different code path now.',
];

// ---- static data: issues ---------------------------------------------------

type ThreadMsg = { by: string; body: string; visibility?: CommentVisibility; daysAgo?: number };
type AttachSpec = { filename: string; contentType: string; sizeBytes: number; scan?: ScanStatus };
type IssueSpec = {
  platform: string;
  reporter: string;
  description: string;
  priority: Priority;
  status: IssueStatus;
  createdDaysAgo: number;
  resolvedDaysAgo?: number;
  closedDaysAgo?: number;
  reopenedDaysAgo?: number;
  assignee?: string; // staff key — must be a developer on the platform
  jira?: string;
  thread?: ThreadMsg[];
  attachments?: AttachSpec[];
  notifyAdmin?: boolean; // raises an @mention notification to the admin (bell)
  seen?: boolean; // has the reporter seen the latest update?
};

const rv = CommentVisibility.REPORTER_VISIBLE;
const internal = CommentVisibility.INTERNAL;

const ISSUES: IssueSpec[] = [
  // ── Nimbus CRM ──────────────────────────────────────────────────────────
  {
    platform: 'nimbus-crm', reporter: 'priya', priority: Priority.HIGH, status: IssueStatus.RESOLVED,
    createdDaysAgo: 9, resolvedDaysAgo: 5, assignee: 'hannah', seen: true,
    description:
      'CSV import of contacts silently drops every row where the name contains accented characters (e.g. José, Müller). About 1 in 5 contacts never imports.',
    attachments: [{ filename: 'contacts-export.csv', contentType: 'text/csv', sizeBytes: 184_320, scan: ScanStatus.CLEAN }],
    thread: [
      { by: 'priya', body: "I've attached the file that fails — roughly 240 of 1,243 rows are missing after import.", visibility: rv, daysAgo: 8.8 },
      { by: 'wei', body: 'Thanks Priya — reproduced with your file. Assigning to engineering now.', visibility: rv, daysAgo: 8.4 },
      { by: 'hannah', body: 'Encoding bug: the parser assumes Latin-1. Switching to UTF-8 with BOM detection.', visibility: internal, daysAgo: 8 },
      { by: 'hannah', body: 'Fix is on staging and verifying a full import of your file now.', visibility: rv, daysAgo: 5.4 },
      { by: 'hannah', body: "Resolved in today's release — all accented names import correctly. Please re-run your import.", visibility: rv, daysAgo: 5 },
      { by: 'priya', body: 'Confirmed — all 1,243 contacts imported. Thank you!', visibility: rv, daysAgo: 4.6 },
    ],
  },
  {
    platform: 'nimbus-crm', reporter: 'tom', priority: Priority.MEDIUM, status: IssueStatus.IN_PROGRESS,
    createdDaysAgo: 2.6, assignee: 'hannah',
    description: 'Deal pipeline drag-and-drop resets the card back to its original stage after a page refresh.',
  },
  {
    platform: 'nimbus-crm', reporter: 'lucia', priority: Priority.LOW, status: IssueStatus.NEW,
    createdDaysAgo: 0.3,
    description: 'Cannot remove a duplicate company record — the Delete button just shows a spinner forever.',
  },
  {
    platform: 'nimbus-crm', reporter: 'priya', priority: Priority.MEDIUM, status: IssueStatus.ON_HOLD,
    createdDaysAgo: 6, assignee: 'raj',
    description: 'Email merge fields render as raw {{first_name}} in the Outlook plugin only — the web composer is fine.',
  },
  {
    platform: 'nimbus-crm', reporter: 'tom', priority: Priority.HIGH, status: IssueStatus.CLOSED,
    createdDaysAgo: 13, resolvedDaysAgo: 9, closedDaysAgo: 7, assignee: 'hannah',
    description: 'Reports export to Excel times out for pipelines with more than 10,000 deals.',
  },
  {
    platform: 'nimbus-crm', reporter: 'lucia', priority: Priority.LOW, status: IssueStatus.RESOLVED,
    createdDaysAgo: 8, resolvedDaysAgo: 3, assignee: 'raj', seen: true,
    description: 'Search returns no results when querying a contact by phone number that includes the country code.',
  },
  {
    platform: 'nimbus-crm', reporter: 'priya', priority: Priority.CRITICAL, status: IssueStatus.IN_PROGRESS,
    createdDaysAgo: 2, assignee: 'hannah', notifyAdmin: true, seen: false,
    description: 'New lead web-form submissions are duplicated when the user double-clicks Submit — duplicates are polluting the sales queue.',
    thread: [
      { by: 'priya', body: 'This is creating duplicate leads in production — fairly urgent for us.', visibility: rv, daysAgo: 1.9 },
      { by: 'wei', body: '@Ananya @Hannah flagging as critical — double submissions hitting live traffic.', visibility: internal, daysAgo: 1.8 },
      { by: 'hannah', body: 'Shipped a temporary submit-button debounce. Working on server-side dedupe (idempotency key) now.', visibility: rv, daysAgo: 1.4 },
      { by: 'hannah', body: 'Adding an idempotency key on the intake endpoint; PR in review.', visibility: internal, daysAgo: 0.5 },
    ],
  },
  {
    platform: 'nimbus-crm', reporter: 'tom', priority: Priority.HIGH, status: IssueStatus.REOPENED,
    createdDaysAgo: 11, reopenedDaysAgo: 1, assignee: 'hannah', seen: false,
    description: 'Mobile app crashes when opening a contact that has no email address on file.',
  },

  // ── Vault Pay (Jira-linked) ──────────────────────────────────────────────
  {
    platform: 'vault-pay', reporter: 'daniel', priority: Priority.CRITICAL, status: IssueStatus.IN_PROGRESS,
    createdDaysAgo: 1.5, assignee: 'diego', jira: 'VAULT-204', notifyAdmin: true, seen: false,
    description: 'Refund webhook fires twice for partially-refunded transactions, double-counting refunds in our ledger.',
    thread: [
      { by: 'daniel', body: "We're double-counting refunds in our ledger — this needs urgent attention.", visibility: rv, daysAgo: 1.4 },
      { by: 'sofia', body: '@Ananya escalating — this is finance-impacting. @Diego please prioritise.', visibility: internal, daysAgo: 1.3 },
      { by: 'diego', body: 'Confirmed the webhook retries on partial refunds. Shipping a fix to dedupe by event id.', visibility: rv, daysAgo: 1.0 },
      { by: 'diego', body: 'Tracked as VAULT-204 in Jira; fix in review.', visibility: internal, daysAgo: 0.3 },
    ],
  },
  {
    platform: 'vault-pay', reporter: 'mei', priority: Priority.MEDIUM, status: IssueStatus.RESOLVED,
    createdDaysAgo: 7, resolvedDaysAgo: 2, assignee: 'diego', jira: 'VAULT-198', seen: true,
    description: 'Settlement report total is off by one cent due to rounding of the final line item.',
  },
  {
    platform: 'vault-pay', reporter: 'olu', priority: Priority.HIGH, status: IssueStatus.ON_HOLD,
    createdDaysAgo: 5, assignee: 'diego', jira: 'VAULT-201',
    description: "Card payments in BRL are declined with a generic 'processor error' — only BRL is affected.",
  },
  {
    platform: 'vault-pay', reporter: 'daniel', priority: Priority.LOW, status: IssueStatus.NEW,
    createdDaysAgo: 0.5,
    description: 'Payout schedule shows the wrong timezone for accounts based in IST.',
  },
  {
    platform: 'vault-pay', reporter: 'mei', priority: Priority.MEDIUM, status: IssueStatus.CLOSED,
    createdDaysAgo: 12, resolvedDaysAgo: 8, closedDaysAgo: 6, assignee: 'raj', jira: 'VAULT-190',
    description: 'Dispute evidence upload fails for PDFs over 4 MB with no error shown to the user.',
    attachments: [{ filename: 'dispute-evidence.pdf', contentType: 'application/pdf', sizeBytes: 4_510_000, scan: ScanStatus.CLEAN }],
  },
  {
    platform: 'vault-pay', reporter: 'olu', priority: Priority.LOW, status: IssueStatus.IN_PROGRESS,
    createdDaysAgo: 6.1, assignee: 'diego',
    description: 'API rate-limit headers (X-RateLimit-*) are missing on the /v2/charges endpoint.',
  },
  {
    platform: 'vault-pay', reporter: 'daniel', priority: Priority.LOW, status: IssueStatus.RESOLVED,
    createdDaysAgo: 10, resolvedDaysAgo: 4, assignee: 'raj', seen: true,
    description: 'The webhook signature verification example in the docs uses the wrong header name.',
  },

  // ── ShiftBridge HR ───────────────────────────────────────────────────────
  {
    platform: 'shiftbridge-hr', reporter: 'sara', priority: Priority.HIGH, status: IssueStatus.IN_PROGRESS,
    createdDaysAgo: 0.85, assignee: 'aisha', seen: false,
    description: 'Leave balance goes negative after approving two overlapping requests in quick succession.',
    thread: [
      { by: 'sara', body: 'Two managers approved overlapping leave and the balance dropped to -3 days.', visibility: rv, daysAgo: 0.8 },
      { by: 'omar', body: "Thanks Sara — reproduced. We're adding a concurrency check on approvals.", visibility: rv, daysAgo: 0.7 },
      { by: 'aisha', body: 'Race condition on approval — wrapping the balance update in a transaction with a row lock.', visibility: internal, daysAgo: 0.4 },
    ],
  },
  {
    platform: 'shiftbridge-hr', reporter: 'kwame', priority: Priority.MEDIUM, status: IssueStatus.ON_HOLD,
    createdDaysAgo: 6, assignee: 'aisha',
    description: 'Org chart fails to render for departments with more than 200 employees.',
  },
  {
    platform: 'shiftbridge-hr', reporter: 'elena', priority: Priority.CRITICAL, status: IssueStatus.RESOLVED,
    createdDaysAgo: 9, resolvedDaysAgo: 6, assignee: 'aisha', notifyAdmin: true, seen: true,
    description: 'Payslip PDF shows the previous month’s figures on the first of the month.',
  },
  {
    platform: 'shiftbridge-hr', reporter: 'sara', priority: Priority.MEDIUM, status: IssueStatus.CLOSED,
    createdDaysAgo: 13, resolvedDaysAgo: 10, closedDaysAgo: 8, assignee: 'raj',
    description: 'New-hire onboarding checklist emails are sent twice.',
  },
  {
    platform: 'shiftbridge-hr', reporter: 'kwame', priority: Priority.LOW, status: IssueStatus.NEW,
    createdDaysAgo: 0.2,
    description: 'Cannot upload a profile photo larger than 1 MB — it fails silently with no message.',
  },
  {
    platform: 'shiftbridge-hr', reporter: 'elena', priority: Priority.MEDIUM, status: IssueStatus.RESOLVED,
    createdDaysAgo: 7, resolvedDaysAgo: 1, assignee: 'aisha', seen: false,
    description: 'Time-off calendar export (.ics) has every event shifted by one day.',
  },
  {
    platform: 'shiftbridge-hr', reporter: 'sara', priority: Priority.HIGH, status: IssueStatus.REOPENED,
    createdDaysAgo: 12, reopenedDaysAgo: 2, assignee: 'aisha', seen: false,
    description: 'Manager dashboard headcount still includes terminated employees.',
  },
  {
    platform: 'shiftbridge-hr', reporter: 'kwame', priority: Priority.HIGH, status: IssueStatus.IN_PROGRESS,
    createdDaysAgo: 3, assignee: 'aisha',
    description: '2FA setup QR code does not scan in Google Authenticator on Android 14.',
  },

  // ── CargoPilot Logistics ─────────────────────────────────────────────────
  {
    platform: 'cargopilot', reporter: 'yuki', priority: Priority.HIGH, status: IssueStatus.RESOLVED,
    createdDaysAgo: 8, resolvedDaysAgo: 4, assignee: 'mateo', seen: true,
    description: 'Shipment ETA is off by exactly one hour for all routes since the daylight-saving change.',
    thread: [
      { by: 'yuki', body: 'Every route ETA has been exactly one hour early since Sunday.', visibility: rv, daysAgo: 7.8 },
      { by: 'noah', body: 'Confirmed — looks DST-related. Assigning to Mateo.', visibility: rv, daysAgo: 7.4 },
      { by: 'mateo', body: 'We were storing local time without an offset; converting to UTC end-to-end.', visibility: internal, daysAgo: 6 },
      { by: 'mateo', body: 'Fixed and deployed — ETAs are correct across all timezones now.', visibility: rv, daysAgo: 4 },
      { by: 'yuki', body: 'Looks good now, thanks!', visibility: rv, daysAgo: 3.5 },
    ],
  },
  {
    platform: 'cargopilot', reporter: 'carlos', priority: Priority.MEDIUM, status: IssueStatus.IN_PROGRESS,
    createdDaysAgo: 2.7, assignee: 'mateo',
    description: 'Bulk label printing stops after exactly 50 rows are selected.',
  },
  {
    platform: 'cargopilot', reporter: 'fatima', priority: Priority.CRITICAL, status: IssueStatus.ON_HOLD,
    createdDaysAgo: 1.2, assignee: 'mateo',
    description: "Tracking page shows 'Delivered' before the package is scanned at the final hub.",
  },
  {
    platform: 'cargopilot', reporter: 'yuki', priority: Priority.MEDIUM, status: IssueStatus.CLOSED,
    createdDaysAgo: 12, resolvedDaysAgo: 9, closedDaysAgo: 6, assignee: 'raj',
    description: 'Customs document generator omits the HS code for multi-item shipments.',
    attachments: [{ filename: 'customs-declaration.pdf', contentType: 'application/pdf', sizeBytes: 822_000, scan: ScanStatus.CLEAN }],
  },
  {
    platform: 'cargopilot', reporter: 'carlos', priority: Priority.HIGH, status: IssueStatus.IN_PROGRESS,
    createdDaysAgo: 4, assignee: 'mateo', notifyAdmin: true,
    description: 'Driver mobile app logs the user out every time it briefly loses signal.',
  },
  {
    platform: 'cargopilot', reporter: 'fatima', priority: Priority.LOW, status: IssueStatus.NEW,
    createdDaysAgo: 0.4,
    description: 'Rate calculator rounds weight down instead of up for fractional kilograms.',
  },
  {
    platform: 'cargopilot', reporter: 'yuki', priority: Priority.LOW, status: IssueStatus.RESOLVED,
    createdDaysAgo: 10, resolvedDaysAgo: 5, assignee: 'mateo', seen: true,
    description: 'Address autocomplete suggests the wrong postal code for some rural ZIP codes.',
  },
  {
    platform: 'cargopilot', reporter: 'carlos', priority: Priority.MEDIUM, status: IssueStatus.REOPENED,
    createdDaysAgo: 11, reopenedDaysAgo: 1, assignee: 'mateo', seen: false,
    description: 'Warehouse scanner beeps but does not register items intermittently.',
    attachments: [{ filename: 'scanner-debug.log', contentType: 'text/plain', sizeBytes: 24_900, scan: ScanStatus.SKIPPED }],
  },
  {
    platform: 'cargopilot', reporter: 'fatima', priority: Priority.LOW, status: IssueStatus.CLOSED,
    createdDaysAgo: 13.5, resolvedDaysAgo: 11, closedDaysAgo: 9, assignee: 'raj',
    description: 'An invoice PDF a customer attached was flagged by malware scanning and could not be downloaded.',
    attachments: [{ filename: 'invoice-Q3.pdf', contentType: 'application/pdf', sizeBytes: 1_280_000, scan: ScanStatus.INFECTED }],
  },
];

// The valid lifecycle path to reach a given status (mirrors status-machine.ts).
function statusPath(status: IssueStatus): IssueStatus[] {
  switch (status) {
    case IssueStatus.NEW: return [];
    case IssueStatus.IN_PROGRESS: return [IssueStatus.IN_PROGRESS];
    case IssueStatus.ON_HOLD: return [IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD];
    case IssueStatus.RESOLVED: return [IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED];
    case IssueStatus.CLOSED: return [IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED, IssueStatus.CLOSED];
    case IssueStatus.REOPENED: return [IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED, IssueStatus.REOPENED];
  }
}

// Build a believable comment thread when an issue doesn't define one.
function autoThread(spec: IssueSpec, fpKey: string, idx: number): ThreadMsg[] {
  const dev = spec.assignee ?? 'raj';
  const fp = fpKey || 'raj';
  const ack: ThreadMsg = { by: fp, body: byIdx(ACK, idx), visibility: rv };
  switch (spec.status) {
    case IssueStatus.NEW:
      return [];
    case IssueStatus.IN_PROGRESS:
      return [ack, { by: dev, body: byIdx(NOTE, idx), visibility: internal }];
    case IssueStatus.ON_HOLD:
      return [ack, { by: dev, body: byIdx(HOLD, idx), visibility: internal }];
    case IssueStatus.RESOLVED:
      return [ack, { by: dev, body: byIdx(NOTE, idx), visibility: internal }, { by: dev, body: byIdx(RES, idx), visibility: rv }, { by: spec.reporter, body: byIdx(THANKS, idx), visibility: rv }];
    case IssueStatus.CLOSED:
      return [ack, { by: dev, body: byIdx(NOTE, idx), visibility: internal }, { by: dev, body: byIdx(RES, idx), visibility: rv }];
    case IssueStatus.REOPENED:
      return [ack, { by: dev, body: byIdx(RES, idx), visibility: rv }, { by: spec.reporter, body: byIdx(REOPEN, idx), visibility: rv }, { by: dev, body: byIdx(REOPEN_NOTE, idx), visibility: internal }];
  }
}

// ---- main ------------------------------------------------------------------

async function main() {
  // Never alter the schema — production tables come from migrations.
  AppDataSource.setOptions({ synchronize: false });
  const ds = await AppDataSource.initialize();
  console.log('\n  Connected to database.');

  console.log('  Wiping existing data…');
  await ds.query(
    `TRUNCATE TABLE
      notification_logs, reporter_issue_views, audit_events, comments,
      attachments, issues, reporters, user_platform_roles, saved_views,
      staff_users, platforms
     RESTART IDENTITY CASCADE`,
  );

  const platformRepo = ds.getRepository(Platform);
  const staffRepo = ds.getRepository(StaffUser);
  const roleRepo = ds.getRepository(UserPlatformRole);
  const reporterRepo = ds.getRepository(Reporter);
  const issueRepo = ds.getRepository(Issue);
  const commentRepo = ds.getRepository(Comment);
  const auditRepo = ds.getRepository(AuditEvent);
  const notifRepo = ds.getRepository(NotificationLog);
  const viewRepo = ds.getRepository(ReporterIssueView);
  const attachRepo = ds.getRepository(Attachment);
  const savedRepo = ds.getRepository(SavedView);

  // ── Platforms ──────────────────────────────────────────────────────────
  const platformByKey = new Map<string, Platform>();
  for (const p of PLATFORMS) {
    const saved = await platformRepo.save(
      platformRepo.create({
        key: p.key,
        name: p.name,
        status: PlatformStatus.ACTIVE,
        handoffSecret: `demo-secret-${p.key}`,
        jiraEnabled: p.jira,
        jiraProjectKey: p.jiraKey,
      }),
    );
    platformByKey.set(p.key, saved);
  }
  console.log(`  ✓ ${PLATFORMS.length} platforms`);

  // ── Staff + role grants ────────────────────────────────────────────────
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const staffHash = await bcrypt.hash(STAFF_PASSWORD, 10);
  const staffByKey = new Map<string, StaffUser>();
  const focalPointByPlatform = new Map<string, string>();
  for (const s of STAFF) {
    const user = await staffRepo.save(
      staffRepo.create({
        idpSubject: `local:${s.email}`,
        name: s.name,
        email: s.email,
        status: AccountStatus.ACTIVE,
        passwordHash: s.admin ? adminHash : staffHash,
      }),
    );
    staffByKey.set(s.key, user);
    for (const r of s.roles) {
      await roleRepo.save(
        roleRepo.create({
          staffUser: { id: user.id } as any,
          platform: r.platform ? ({ id: platformByKey.get(r.platform)!.id } as any) : null,
          role: r.role,
        }),
      );
      if (r.role === Role.FOCAL_POINT && r.platform) focalPointByPlatform.set(r.platform, s.key);
    }
  }
  console.log(`  ✓ ${STAFF.length} staff users with role grants`);

  // ── Reporters ──────────────────────────────────────────────────────────
  const reporterByKey = new Map<string, Reporter>();
  for (const r of REPORTERS) {
    const platform = platformByKey.get(r.platform)!;
    const domain = PLATFORMS.find((p) => p.key === r.platform)!.domain;
    const email = `${r.name.toLowerCase().replace(/[^a-z]+/g, '.')}@${domain}`;
    const saved = await reporterRepo.save(
      reporterRepo.create({
        platform: { id: platform.id } as any,
        portalUserId: r.portalUserId,
        name: r.name,
        email,
      }),
    );
    reporterByKey.set(r.key, saved);
  }
  console.log(`  ✓ ${REPORTERS.length} reporters`);

  // ── Issues + all child records ──────────────────────────────────────────
  const repFirstSeen = new Map<string, Date>();
  const repLastSeen = new Map<string, Date>();
  let issueCount = 0;
  let commentCount = 0;
  let notifCount = 0;
  let seq = 1000;

  for (let idx = 0; idx < ISSUES.length; idx++) {
    const spec = ISSUES[idx];
    const ref = `SUP-${++seq}`;
    const platform = platformByKey.get(spec.platform)!;
    const reporter = reporterByKey.get(spec.reporter)!;
    const assignee = spec.assignee ? staffByKey.get(spec.assignee)! : null;
    const fpKey = focalPointByPlatform.get(spec.platform);
    const fp = fpKey ? staffByKey.get(fpKey)! : null;

    const created = daysAgo(spec.createdDaysAgo, (seq * 7) % 24);
    const tResolved = spec.resolvedDaysAgo != null ? daysAgo(spec.resolvedDaysAgo) : null;
    const tClosed = spec.closedDaysAgo != null ? daysAgo(spec.closedDaysAgo) : null;

    // resolved_at / closed_at columns per the status side-effects.
    let resolvedAt: Date | null = null;
    let closedAt: Date | null = null;
    if (spec.status === IssueStatus.RESOLVED) resolvedAt = tResolved;
    if (spec.status === IssueStatus.CLOSED) {
      resolvedAt = tResolved;
      closedAt = tClosed;
    }

    // The "final activity" timestamp drives the status timeline + recency.
    const finalDaysAgo =
      spec.status === IssueStatus.RESOLVED ? spec.resolvedDaysAgo! :
      spec.status === IssueStatus.CLOSED ? spec.closedDaysAgo! :
      spec.status === IssueStatus.REOPENED ? (spec.reopenedDaysAgo ?? 1) :
      spec.status === IssueStatus.NEW ? spec.createdDaysAgo :
      Math.max(0.2, spec.createdDaysAgo * 0.4);
    const finalAt = daysAgo(finalDaysAgo);

    const issue = await issueRepo.save(
      issueRepo.create({
        referenceNo: ref,
        platform: { id: platform.id } as any,
        reporter: { id: reporter.id } as any,
        assignee: assignee ? ({ id: assignee.id } as any) : null,
        description: spec.description,
        status: spec.status,
        priority: spec.priority,
        resolvedAt,
        closedAt,
        jiraIssueKey: spec.jira ?? null,
        jiraSyncStatus: spec.jira ? JiraSyncStatus.SYNCED : JiraSyncStatus.NOT_SYNCED,
      }),
    );
    issueCount++;
    let lastActivity = created;

    // Small helpers (close over `issue`/repos) that also back-date the row.
    const addAudit = async (at: Date, data: Partial<AuditEvent>) => {
      const e = await auditRepo.save(auditRepo.create({ issue: { id: issue.id } as any, ...data }));
      await ds.query('UPDATE audit_events SET created_at=$1 WHERE id=$2', [at, e.id]);
    };
    const addNotif = async (
      recipientRef: string, trigger: string, channel: NotificationChannel, read: boolean, at: Date,
    ) => {
      const n = await notifRepo.save(
        notifRepo.create({
          issue: { id: issue.id } as any,
          recipientType: RecipientType.STAFF,
          recipientRef,
          trigger,
          channel,
          status: NotificationStatus.SENT,
          readAt: read ? new Date(at.getTime() + 6 * HOUR) : null,
        }),
      );
      await ds.query('UPDATE notification_logs SET created_at=$1 WHERE id=$2', [at, n.id]);
      notifCount++;
    };

    // Audit: creation (by the reporter).
    await addAudit(created, {
      actorType: ActorType.REPORTER,
      actorId: reporter.id,
      action: 'ISSUE_CREATED',
    });

    // The staff actor who drove the lifecycle (assignee, else focal point).
    const actor = assignee ?? fp ?? staffByKey.get('raj')!;

    // Audit + notification for assignment.
    if (assignee) {
      const assignAt = new Date(created.getTime() + 2 * HOUR);
      await addAudit(assignAt, {
        actorType: ActorType.STAFF,
        actorId: (fp ?? actor).id,
        action: 'ASSIGNED',
        field: 'assignee',
        oldValue: null,
        newValue: assignee.id,
      });
      await addNotif(assignee.id, 'issue.assigned', NotificationChannel.EMAIL, finalDaysAgo > 5, assignAt);
    }

    // Audit: each status transition along the valid path.
    const hops = statusPath(spec.status);
    let prev = IssueStatus.NEW;
    hops.forEach((s, i) => {
      let at: Date;
      if (s === IssueStatus.RESOLVED && tResolved) at = tResolved;
      else if (s === IssueStatus.CLOSED && tClosed) at = tClosed;
      else if (s === IssueStatus.REOPENED) at = finalAt;
      else at = interp(created, finalAt, (i + 1) / hops.length);
      lastActivity = maxDate(lastActivity, at);
      const from = prev;
      void addAudit(at, {
        actorType: ActorType.STAFF,
        actorId: actor.id,
        action: 'STATUS_CHANGED',
        field: 'status',
        oldValue: from,
        newValue: s,
      });
      prev = s;
    });

    // Notification: focal point(s) alerted on creation.
    if (fp) {
      await addNotif(fp.id, 'issue.created', NotificationChannel.EMAIL, spec.createdDaysAgo > 5, new Date(created.getTime() + 5 * 60_000));
    }

    // Notification: status change (last hop) → assignee + focal point, minus actor.
    if (spec.status !== IssueStatus.NEW) {
      const recipients = [assignee, fp].filter((u): u is StaffUser => !!u && u.id !== actor.id);
      for (const r of recipients) {
        await addNotif(r.id, 'issue.status_changed', NotificationChannel.EMAIL, finalDaysAgo > 5, finalAt);
      }
    }

    // Comments (explicit thread, or an auto-generated one).
    const msgs = spec.thread ?? autoThread(spec, fpKey ?? 'raj', idx);
    let reporterReplyAt: Date | null = null;
    for (let k = 0; k < msgs.length; k++) {
      const m = msgs[k];
      const at = m.daysAgo != null ? daysAgo(m.daysAgo) : interp(created, finalAt, (k + 1) / (msgs.length + 1));
      const isReporter = m.by === spec.reporter || m.by === 'reporter';
      const staff = isReporter ? null : staffByKey.get(m.by) ?? null;
      const visibility = m.visibility ?? (isReporter ? rv : internal);
      const c = await commentRepo.save(
        commentRepo.create({
          issue: { id: issue.id } as any,
          author: staff ? ({ id: staff.id } as any) : null,
          authorType: isReporter ? ActorType.REPORTER : ActorType.STAFF,
          authorName: isReporter ? reporter.name : null,
          body: m.body,
          visibility,
        }),
      );
      await ds.query('UPDATE comments SET created_at=$1 WHERE id=$2', [at, c.id]);
      await addAudit(at, {
        actorType: isReporter ? ActorType.REPORTER : ActorType.STAFF,
        actorId: isReporter ? reporter.id : staff?.id ?? null,
        action: 'COMMENT_ADDED',
      });
      commentCount++;
      lastActivity = maxDate(lastActivity, at);
      if (isReporter && visibility === rv) reporterReplyAt = at;
    }

    // Notification: reporter reply → assignee + focal point.
    if (reporterReplyAt) {
      const recipients = [assignee, fp].filter((u): u is StaffUser => !!u);
      for (const r of recipients) {
        await addNotif(r.id, 'comment.reporter_reply', NotificationChannel.EMAIL, false, reporterReplyAt);
      }
    }

    // Notification: @mention the admin (keeps the admin's bell populated).
    if (spec.notifyAdmin) {
      const admin = staffByKey.get('admin')!;
      await addNotif(admin.id, 'comment.mention', NotificationChannel.IN_APP, false, interp(created, finalAt, 0.5));
    }

    // Attachments.
    for (const a of spec.attachments ?? []) {
      await attachRepo.save(
        attachRepo.create({
          issue: { id: issue.id } as any,
          storageKey: `seed/${ref}/${a.filename}`,
          filename: a.filename,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          scanStatus: a.scan ?? ScanStatus.CLEAN,
          jiraSynced: false,
        }),
      );
    }

    // Reporter "has new updates" indicator: seen → viewed after last activity;
    // unseen → viewed right after creation, so later updates light the dot.
    const seen = spec.seen ?? (idx % 2 === 0);
    const lastViewedAt = seen
      ? new Date(lastActivity.getTime() + HOUR)
      : new Date(created.getTime() + 10 * 60_000);
    await viewRepo.save(
      viewRepo.create({
        reporter: { id: reporter.id } as any,
        issue: { id: issue.id } as any,
        lastViewedAt,
      }),
    );

    // Back-date the issue itself (CreateDateColumn/UpdateDateColumn default now()).
    await ds.query('UPDATE issues SET created_at=$1, updated_at=$2 WHERE id=$3', [created, lastActivity, issue.id]);

    // Track reporter first/last seen for back-dating below.
    const f = repFirstSeen.get(reporter.id);
    if (!f || created < f) repFirstSeen.set(reporter.id, created);
    const l = repLastSeen.get(reporter.id);
    if (!l || lastActivity > l) repLastSeen.set(reporter.id, lastActivity);
  }

  // Back-date reporter first/last seen so their profiles look lived-in.
  for (const [id, first] of repFirstSeen) {
    const last = repLastSeen.get(id) ?? first;
    await ds.query('UPDATE reporters SET first_seen_at=$1, last_seen_at=$2 WHERE id=$3', [first, last, id]);
  }
  console.log(`  ✓ ${issueCount} issues, ${commentCount} comments, ${notifCount} notifications`);

  // ── Saved views (per-staff issue-list filters) ───────────────────────────
  const base = { status: '', priority: '', q: '', assignedToMe: false, platformId: '', from: '', to: '', sort: 'createdAt', order: 'DESC' };
  const nimbusId = platformByKey.get('nimbus-crm')!.id;
  const vaultId = platformByKey.get('vault-pay')!.id;
  const SAVED_VIEWS: { staff: string; name: string; filters: Record<string, unknown> }[] = [
    { staff: 'admin', name: 'Critical priority', filters: { ...base, priority: Priority.CRITICAL } },
    { staff: 'admin', name: 'New & untriaged', filters: { ...base, status: IssueStatus.NEW } },
    { staff: 'admin', name: 'Recently resolved', filters: { ...base, status: IssueStatus.RESOLVED, sort: 'updatedAt' } },
    { staff: 'wei', name: 'Nimbus · In progress', filters: { ...base, status: IssueStatus.IN_PROGRESS, platformId: nimbusId } },
    { staff: 'sofia', name: 'Vault · High priority', filters: { ...base, priority: Priority.HIGH, platformId: vaultId } },
    { staff: 'raj', name: 'Assigned to me', filters: { ...base, assignedToMe: true } },
  ];
  for (const v of SAVED_VIEWS) {
    await savedRepo.save(
      savedRepo.create({
        staffUser: { id: staffByKey.get(v.staff)!.id } as any,
        name: v.name,
        filters: v.filters,
      }),
    );
  }
  console.log(`  ✓ ${SAVED_VIEWS.length} saved views`);

  // ── Reporter hand-off token for the demo portal ──────────────────────────
  const demoPlatform = platformByKey.get('nimbus-crm')!;
  const demoReporter = reporterByKey.get('priya')!;
  const token = jwt.sign(
    {
      platformKey: 'nimbus-crm',
      portalUserId: demoReporter.portalUserId,
      name: demoReporter.name,
      email: demoReporter.email,
    },
    'demo-secret-nimbus-crm',
    { algorithm: 'HS256', expiresIn: '7d' },
  );

  // ── Summary ──────────────────────────────────────────────────────────────
  const line = '─'.repeat(74);
  console.log(`\n${line}`);
  console.log('  SEED COMPLETE — demo data is ready.');
  console.log(line);
  console.log('\n  STAFF SIGN-IN  →  ' + `${APP_URL}/staff`);
  console.log(`    Admin (full access):  ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}`);
  console.log(`    All other staff share the password:  ${STAFF_PASSWORD}\n`);
  console.log(`    ${'EMAIL'.padEnd(26)} ROLE / SCOPE`);
  for (const s of STAFF) {
    if (s.admin) continue;
    const scope = s.roles.map((r) => `${r.role}${r.platform ? ` @ ${r.platform}` : ' (global)'}`).join(', ');
    console.log(`    ${s.email.padEnd(26)} ${scope}`);
  }
  console.log('\n  REPORTER PORTAL (no login — open this link; token valid 7 days):');
  console.log(`    ${APP_URL}/reporter/issues?handoff=${token}`);
  console.log(`    (Demo portal: ${demoPlatform.name} · reporter ${demoReporter.name})`);
  console.log('\n  Mint another reporter token any time:');
  console.log('    npm run token -- nimbus-crm demo-secret-nimbus-crm u-2001 "Priya Nair" priya@example.com');
  console.log(`\n${line}\n`);

  await ds.destroy();
}

main().catch((err) => {
  console.error('\n  ✗ Seed failed:\n', err);
  process.exit(1);
});
