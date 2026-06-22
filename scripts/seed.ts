import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../src/data-source';
import { Platform, StaffUser, UserPlatformRole } from '../src/entities';
import { AccountStatus, PlatformStatus, Role } from '../src/common/enums';

const ADMIN_EMAIL = 'admin@cimp.dev';
const ADMIN_PASSWORD = 'Password123!';

// Seeds a demo portal + a staff admin account, and prints a ready-to-use
// reporter hand-off token and the admin login. Run: npm run seed
async function main() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(Platform);

  const key = 'portal-a';
  const secret = 'dev-secret-portal-a';

  let platform = await repo.findOne({ where: { key } });
  if (!platform) {
    platform = repo.create({
      key,
      name: 'Portal A',
      status: PlatformStatus.ACTIVE,
      handoffSecret: secret,
    });
    platform = await repo.save(platform);
    console.log(`Created platform "${key}" (${platform.id})`);
  } else {
    console.log(`Platform "${key}" already exists (${platform.id})`);
  }

  // A staff admin you can log into the workspace with (self-issued JWT).
  const staffRepo = AppDataSource.getRepository(StaffUser);
  let admin = await staffRepo.findOne({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    admin = await staffRepo.save(
      staffRepo.create({
        idpSubject: `local:${ADMIN_EMAIL}`,
        name: 'Demo Admin',
        email: ADMIN_EMAIL,
        status: AccountStatus.ACTIVE,
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      }),
    );
    await AppDataSource.getRepository(UserPlatformRole).save(
      AppDataSource.getRepository(UserPlatformRole).create({
        staffUser: { id: admin.id } as any,
        platform: null,
        role: Role.ADMIN,
      }),
    );
    console.log(`Created admin staff "${ADMIN_EMAIL}"`);
  } else {
    console.log(`Admin staff "${ADMIN_EMAIL}" already exists`);
  }

  const token = jwt.sign(
    { platformKey: key, portalUserId: 'u-1001', name: 'Asha Rao', email: 'asha@example.org' },
    secret,
    { algorithm: 'HS256', expiresIn: '5m' },
  );

  console.log(`\nStaff login (email + password): ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

  console.log('\nSample reporter hand-off token (valid 5 min):\n');
  console.log(token);
  console.log('\nTry it:\n');
  console.log(`curl -X POST http://localhost:3000/api/reporter/issues \\
  -H "X-Handoff-Token: ${token}" \\
  -F "description=The export button on the dashboard returns a 500 error." \\
  -F "files=@/path/to/screenshot.png"`);

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
