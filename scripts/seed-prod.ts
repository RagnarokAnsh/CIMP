import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../src/data-source';
import { Platform, StaffUser, UserPlatformRole } from '../src/entities';
import { AccountStatus, PlatformStatus, Role } from '../src/common/enums';
import * as crypto from 'crypto';

// Production seeder — reads credentials from env vars instead of hardcoding.
//
// Usage:
//   ADMIN_NAME="Ansh" ADMIN_EMAIL="admin@yourdomain.com" ADMIN_PASSWORD="YourStr0ng!Pass" \
//   PLATFORM_KEY="portal-a" PLATFORM_NAME="Main Portal" \
//   npm run seed:prod
//
// All values have sensible defaults but ADMIN_PASSWORD is REQUIRED.

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.error(`\n  ✗ Missing required env var: ${key}\n`);
    console.error(`  Usage:`);
    console.error(`    ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="S3cure!" npm run seed:prod\n`);
    process.exit(1);
  }
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

async function main() {
  // ── Read config from env ──────────────────────────────────────────
  const adminName     = optional('ADMIN_NAME', 'Admin');
  const adminEmail    = optional('ADMIN_EMAIL', 'admin@cimp.local');
  const adminPassword = required('ADMIN_PASSWORD');

  const platformKey   = optional('PLATFORM_KEY', 'portal-a');
  const platformName  = optional('PLATFORM_NAME', 'Portal A');
  // Generate a cryptographically secure handoff secret if not provided.
  const handoffSecret = optional('HANDOFF_SECRET', crypto.randomBytes(32).toString('hex'));

  // ── Validate password strength ────────────────────────────────────
  if (adminPassword.length < 8) {
    console.error('\n  ✗ ADMIN_PASSWORD must be at least 8 characters.\n');
    process.exit(1);
  }

  // ── Connect (never auto-sync — tables were created by migrations) ──
  AppDataSource.setOptions({ synchronize: false });
  await AppDataSource.initialize();
  console.log('\n  Connected to database.\n');

  try {
    // ── Platform ──────────────────────────────────────────────────
    const platformRepo = AppDataSource.getRepository(Platform);
    let platform = await platformRepo.findOne({ where: { key: platformKey } });
    if (!platform) {
      platform = await platformRepo.save(
        platformRepo.create({
          key: platformKey,
          name: platformName,
          status: PlatformStatus.ACTIVE,
          handoffSecret,
        }),
      );
      console.log(`  ✓ Created platform "${platformName}" (key: ${platformKey})`);
      console.log(`    Handoff secret: ${handoffSecret}`);
    } else {
      console.log(`  • Platform "${platformKey}" already exists — skipped.`);
    }

    // ── Admin staff user ──────────────────────────────────────────
    const staffRepo = AppDataSource.getRepository(StaffUser);
    let admin = await staffRepo.findOne({ where: { email: adminEmail } });
    if (!admin) {
      const hash = await bcrypt.hash(adminPassword, 12); // 12 rounds for production
      admin = await staffRepo.save(
        staffRepo.create({
          idpSubject: `local:${adminEmail}`,
          name: adminName,
          email: adminEmail,
          status: AccountStatus.ACTIVE,
          passwordHash: hash,
        }),
      );

      // Grant global ADMIN role.
      await AppDataSource.getRepository(UserPlatformRole).save(
        AppDataSource.getRepository(UserPlatformRole).create({
          staffUser: { id: admin.id } as any,
          platform: null,
          role: Role.ADMIN,
        }),
      );
      console.log(`  ✓ Created admin user "${adminName}" <${adminEmail}>`);
    } else {
      console.log(`  • Admin "${adminEmail}" already exists — skipped.`);
    }

    // ── Summary ──────────────────────────────────────────────────
    console.log('\n  ─── Seed complete ───');
    console.log(`  Login:    ${adminEmail}`);
    console.log(`  Platform: ${platformKey}`);
    console.log('');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('\n  ✗ Seed failed:\n', err);
  process.exit(1);
});
