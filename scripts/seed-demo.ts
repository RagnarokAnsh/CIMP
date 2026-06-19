import * as jwt from 'jsonwebtoken';
import { AppDataSource } from '../src/data-source';
import {
  AuditEvent, Comment, Issue, NotificationLog, Platform, Reporter,
  ReporterIssueView, StaffUser, UserPlatformRole,
} from '../src/entities';
import {
  AccountStatus, ActorType, CommentVisibility, IssueStatus,
  NotificationChannel, NotificationStatus, Priority, PlatformStatus,
  RecipientType, Role,
} from '../src/common/enums';

// Comprehensive demo seeder. Wipes the schema and fills it with realistic,
// varied data across every entity so the full workflow can be exercised
// end to end. DESTRUCTIVE — run only against a dev database.
//
//   npm run seed:demo

// ---- helpers ---------------------------------------------------------------

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (d: number, jitterHours = 0) =>
  new Date(Date.now() - d * 86400_000 - randInt(0, jitterHours) * 3600_000);

let refSeq = 1000;
const nextRef = () => `SUP-${++refSeq}`;

// ---- static data -----------------------------------------------------------

const PLATFORMS = [
  { key: 'compass-hr', name: 'Compass HR', secret: 'dev-secret-compass', jira: false, jiraKey: null },
  { key: 'ledger-finance', name: 'Ledger Finance', secret: 'dev-secret-ledger', jira: false, jiraKey: null },
  { key: 'atlas-logistics', name: 'Atlas Logistics', secret: 'dev-secret-atlas', jira: true, jiraKey: 'ATL' },
  { key: 'beacon-support', name: 'Beacon Support', secret: 'dev-secret-beacon', jira: false, jiraKey: null },
];

const REPORTER_NAMES = [
  'Asha Rao', 'Liam O\'Connor', 'Mei Lin', 'Carlos Mendes', 'Fatima Zahra',
  'Tobias Werner', 'Nadia Petrova', 'Kwame Mensah', 'Yuki Tanaka', 'Elena Rossi',
  'Rohan Gupta', 'Grace Achieng', 'Daniel Kim', 'Sara Haugen', 'Mateo Silva',
];

const DESCRIPTIONS = [
  'The export to CSV button on the reports page returns a 500 error after I apply a date filter.',
  'I cannot reset my password — the reset email never arrives even after waiting 30 minutes.',
  'Dashboard charts show last month\'s numbers instead of the current period since Tuesday.',
  'Uploading a PDF over 4 MB fails silently with no error message shown to the user.',
  'The search box ignores accented characters, so "Muller" does not find "Müller".',
  'Approvals submitted on mobile are not syncing to the desktop view until I refresh twice.',
  'Two-factor codes are being rejected as expired even immediately after they are generated.',
  'The invoice total rounds incorrectly — it shows 1,204.30 when the line items sum to 1,204.28.',
  'Notifications keep arriving for a ticket I already closed three days ago.',
  'The org chart fails to load for departments with more than 200 people.',
  'Time zone on shipment timestamps is off by one hour since the daylight-saving change.',
  'Bulk edit silently drops changes when more than 50 rows are selected at once.',
];

const STAFF = [
  { sub: 'oidc|priya', name: 'Priya Nair', email: 'priya.nair@cimp.dev', roles: [{ role: Role.ADMIN, platform: null }] },
  { sub: 'oidc|marcus', name: 'Marcus Bell', email: 'marcus.bell@cimp.dev', roles: [{ role: Role.DEVELOPER, platform: null }] },
  { sub: 'oidc|wei', name: 'Wei Chen', email: 'wei.chen@cimp.dev', roles: [{ role: Role.FOCAL_POINT, platform: 'compass-hr' }] },
  { sub: 'oidc|hannah', name: 'Hannah Kim', email: 'hannah.kim@cimp.dev', roles: [{ role: Role.DEVELOPER, platform: 'compass-hr' }] },
  { sub: 'oidc|sofia', name: 'Sofia Marquez', email: 'sofia.marquez@cimp.dev', roles: [{ role: Role.FOCAL_POINT, platform: 'ledger-finance' }] },
  { sub: 'oidc|diego', name: 'Diego Santos', email: 'diego.santos@cimp.dev', roles: [{ role: Role.DEVELOPER, platform: 'ledger-finance' }] },
  { sub: 'oidc|omar', name: 'Omar Haddad', email: 'omar.haddad@cimp.dev', roles: [{ role: Role.FOCAL_POINT, platform: 'atlas-logistics' }] },
  { sub: 'oidc|aisha', name: 'Aisha Bello', email: 'aisha.bello@cimp.dev', roles: [{ role: Role.DEVELOPER, platform: 'atlas-logistics' }] },
  { sub: 'oidc|noah', name: 'Noah Schmidt', email: 'noah.schmidt@cimp.dev', roles: [{ role: Role.FOCAL_POINT, platform: 'beacon-support' }, { role: Role.DEVELOPER, platform: 'beacon-support' }] },
];

const INTERNAL_NOTES = [
  'Reproduced on staging. Looks like a regression from the 4.12 release.',
  'Escalating to the platform team — root cause is in the shared export service.',
  'Workaround applied; permanent fix tracked for next sprint.',
  'Cannot reproduce yet. Asked the reporter for browser and OS details.',
];
const REPORTER_REPLIES = [
  'Thanks for raising this. We\'ve reproduced the problem and a fix is in progress.',
  'A temporary workaround is in place. We\'ll confirm here once the full fix ships.',
  'This has been resolved in today\'s release. Please let us know if it persists.',
  'We need a little more detail — could you tell us which browser you were using?',
];

// Status mix with rough weights, and which timestamps each implies.
const STATUS_PLAN: { status: IssueStatus; weight: number }[] = [
  { status: IssueStatus.NEW, weight: 4 },
  { status: IssueStatus.IN_PROGRESS, weight: 4 },
  { status: IssueStatus.ON_HOLD, weight: 2 },
  { status: IssueStatus.RESOLVED, weight: 3 },
  { status: IssueStatus.CLOSED, weight: 3 },
  { status: IssueStatus.REOPENED, weight: 1 },
];
const STATUS_BAG = STATUS_PLAN.flatMap((s) => Array(s.weight).fill(s.status)) as IssueStatus[];

const PRIORITY_BAG: Priority[] = [
  Priority.LOW, Priority.LOW, Priority.MEDIUM, Priority.MEDIUM, Priority.MEDIUM,
  Priority.HIGH, Priority.HIGH, Priority.CRITICAL,
];

// ---- main ------------------------------------------------------------------

async function main() {
  const ds = await AppDataSource.initialize();

  console.log('Wiping existing data…');
  await ds.query(
    `TRUNCATE TABLE
      notification_logs, reporter_issue_views, audit_events, comments,
      attachments, issues, reporters, user_platform_roles, staff_users, platforms
     RESTART IDENTITY CASCADE`,
  );

  // Platforms
  const platforms = await ds.getRepository(Platform).save(
    PLATFORMS.map((p) =>
      ds.getRepository(Platform).create({
        key: p.key,
        name: p.name,
        status: PlatformStatus.ACTIVE,
        handoffSecret: p.secret,
        jiraEnabled: p.jira,
        jiraProjectKey: p.jiraKey,
      }),
    ),
  );
  const platformByKey = new Map(platforms.map((p) => [p.key, p]));
  console.log(`Created ${platforms.length} platforms.`);

  // Staff + role assignments
  const staffRepo = ds.getRepository(StaffUser);
  const roleRepo = ds.getRepository(UserPlatformRole);
  const staffBySub = new Map<string, StaffUser>();
  for (const s of STAFF) {
    const user = await staffRepo.save(
      staffRepo.create({ idpSubject: s.sub, name: s.name, email: s.email, status: AccountStatus.ACTIVE }),
    );
    staffBySub.set(s.sub, user);
    for (const r of s.roles) {
      await roleRepo.save(
        roleRepo.create({
          staffUser: { id: user.id } as any,
          platform: r.platform ? ({ id: platformByKey.get(r.platform)!.id } as any) : null,
          role: r.role,
        }),
      );
    }
  }
  console.log(`Created ${STAFF.length} staff users with role assignments.`);

  // Developers available per platform (for assignment).
  const devsByPlatform = new Map<string, StaffUser[]>();
  for (const p of platforms) {
    const devs: StaffUser[] = [];
    for (const s of STAFF) {
      const isDev = s.roles.some(
        (r) => r.role === Role.DEVELOPER && (r.platform === null || r.platform === p.key),
      );
      if (isDev) devs.push(staffBySub.get(s.sub)!);
    }
    devsByPlatform.set(p.id, devs);
  }

  // Reporters per platform
  const reporterRepo = ds.getRepository(Reporter);
  const reportersByPlatform = new Map<string, Reporter[]>();
  let portalUser = 1000;
  for (const p of platforms) {
    const count = randInt(3, 4);
    const list: Reporter[] = [];
    for (let i = 0; i < count; i++) {
      const name = pick(REPORTER_NAMES);
      list.push(
        await reporterRepo.save(
          reporterRepo.create({
            platform: { id: p.id } as any,
            portalUserId: `u-${++portalUser}`,
            name,
            email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.org`,
          }),
        ),
      );
    }
    reportersByPlatform.set(p.id, list);
  }

  // Issues + comments + audit + views
  const issueRepo = ds.getRepository(Issue);
  const commentRepo = ds.getRepository(Comment);
  const auditRepo = ds.getRepository(AuditEvent);
  const viewRepo = ds.getRepository(ReporterIssueView);
  const notifRepo = ds.getRepository(NotificationLog);

  let issueCount = 0;
  let commentCount = 0;

  for (const p of platforms) {
    const reporters = reportersByPlatform.get(p.id)!;
    const devs = devsByPlatform.get(p.id)!;
    const n = randInt(10, 14);

    for (let i = 0; i < n; i++) {
      const reporter = pick(reporters);
      const status = pick(STATUS_BAG);
      const priority = pick(PRIORITY_BAG);
      const createdDaysAgo = randInt(1, 28);
      const createdAt = daysAgo(createdDaysAgo, 23);

      const assigned =
        devs.length > 0 && status !== IssueStatus.NEW && Math.random() > 0.25 ? pick(devs) : null;

      let resolvedAt: Date | null = null;
      let closedAt: Date | null = null;
      if (status === IssueStatus.RESOLVED) resolvedAt = daysAgo(randInt(0, createdDaysAgo - 1 || 0), 23);
      if (status === IssueStatus.CLOSED) {
        resolvedAt = daysAgo(randInt(1, createdDaysAgo) || 1, 23);
        closedAt = daysAgo(randInt(0, createdDaysAgo - 1 || 0), 23);
      }

      const issue = await issueRepo.save(
        issueRepo.create({
          referenceNo: nextRef(),
          platform: { id: p.id } as any,
          reporter: { id: reporter.id } as any,
          assignee: assigned ? ({ id: assigned.id } as any) : null,
          description: pick(DESCRIPTIONS),
          status,
          priority,
          resolvedAt,
          closedAt,
        }),
      );
      issueCount++;

      // Audit: creation
      await auditRepo.save(
        auditRepo.create({
          issue: { id: issue.id } as any,
          actorType: ActorType.REPORTER,
          actorId: reporter.id,
          action: 'ISSUE_CREATED',
        }),
      );

      // Staff notification log for creation (focal points)
      await notifRepo.save(
        notifRepo.create({
          issue: { id: issue.id } as any,
          recipientType: RecipientType.STAFF,
          recipientRef: 'focal-points',
          trigger: 'issue.created',
          channel: NotificationChannel.EMAIL,
          status: NotificationStatus.SENT,
        }),
      );

      // Some issues get comments; reporter-visible ones drive "hasUpdates".
      let lastActivity = createdAt;
      const author = assigned ?? pick(devs.length ? devs : [staffBySub.get('oidc|priya')!]);
      const wantsComments = status !== IssueStatus.NEW;
      let reporterVisibleAdded = false;
      if (wantsComments) {
        const c = randInt(1, 3);
        for (let k = 0; k < c; k++) {
          const reporterVisible = Math.random() > 0.5;
          const at = daysAgo(randInt(0, createdDaysAgo - 1 || 0), 23);
          await commentRepo.save(
            commentRepo.create({
              issue: { id: issue.id } as any,
              author: { id: author.id } as any,
              body: reporterVisible ? pick(REPORTER_REPLIES) : pick(INTERNAL_NOTES),
              visibility: reporterVisible ? CommentVisibility.REPORTER_VISIBLE : CommentVisibility.INTERNAL,
            }),
          );
          commentCount++;
          if (at > lastActivity) lastActivity = at;
          if (reporterVisible) reporterVisibleAdded = true;
        }
      }

      // Audit: assignment + status change for non-new issues
      if (assigned) {
        await auditRepo.save(
          auditRepo.create({
            issue: { id: issue.id } as any,
            actorType: ActorType.STAFF,
            actorId: author.id,
            action: 'ASSIGNED',
            field: 'assignee',
            oldValue: null,
            newValue: assigned.id,
          }),
        );
      }
      if (status !== IssueStatus.NEW) {
        await auditRepo.save(
          auditRepo.create({
            issue: { id: issue.id } as any,
            actorType: ActorType.STAFF,
            actorId: author.id,
            action: 'STATUS_CHANGED',
            field: 'status',
            oldValue: IssueStatus.NEW,
            newValue: status,
          }),
        );
      }

      // Reporter view state: ~half "seen", the rest left unread when a
      // reporter-visible update exists (so hasUpdates lights up).
      const seen = Math.random() > 0.5;
      const viewedAt = seen ? new Date(lastActivity.getTime() + 3600_000) : daysAgo(createdDaysAgo, 0);
      await viewRepo.save(
        viewRepo.create({
          reporter: { id: reporter.id } as any,
          issue: { id: issue.id } as any,
          lastViewedAt: viewedAt,
        }),
      );

      // Backdate timestamps (CreateDateColumn defaults to now()).
      const updatedAt = reporterVisibleAdded || status !== IssueStatus.NEW ? lastActivity : createdAt;
      await issueRepo.update(issue.id, { createdAt, updatedAt } as any);
    }
  }

  console.log(`Created ${issueCount} issues and ${commentCount} comments.`);

  // ---- print usage --------------------------------------------------------

  const demoPlatform = platformByKey.get('compass-hr')!;
  const demoReporter = reportersByPlatform.get(demoPlatform.id)![0];
  const token = jwt.sign(
    {
      platformKey: demoPlatform.key,
      portalUserId: demoReporter.portalUserId,
      name: demoReporter.name,
      email: demoReporter.email,
    },
    PLATFORMS.find((p) => p.key === demoPlatform.key)!.secret,
    { algorithm: 'HS256', expiresIn: '2h' },
  );

  console.log('\n──────────────────────────────────────────────────────────');
  console.log('Reporter login (valid 2h) — open the reporter UI with:');
  console.log(`  http://localhost:5173/reporter/issues?handoff=${token}`);
  console.log('\nStaff sign-in is via OIDC. Seeded staff (idpSubject → role):');
  for (const s of STAFF) {
    const scope = s.roles.map((r) => `${r.role}${r.platform ? `@${r.platform}` : ' (global)'}`).join(', ');
    console.log(`  ${s.email.padEnd(28)} ${scope}`);
  }
  console.log('\nGenerate a reporter token for any portal/user:');
  console.log('  npm run token -- <platformKey> <secret> <portalUserId> <name> <email>');
  console.log('──────────────────────────────────────────────────────────\n');

  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
