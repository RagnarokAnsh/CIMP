import * as jwt from 'jsonwebtoken';
import { AppDataSource } from '../src/data-source';
import { Platform } from '../src/entities';
import { PlatformStatus } from '../src/common/enums';

// Seeds a demo portal and prints a ready-to-use hand-off token so you can
// exercise the reporter API immediately. Run: npm run seed
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

  const token = jwt.sign(
    { platformKey: key, portalUserId: 'u-1001', name: 'Asha Rao', email: 'asha@example.org' },
    secret,
    { algorithm: 'HS256', expiresIn: '5m' },
  );

  console.log('\nSample hand-off token (valid 5 min):\n');
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
