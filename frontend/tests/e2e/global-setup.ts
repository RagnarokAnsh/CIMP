import { execSync } from 'node:child_process';

// Seed the dev database (idempotent): guarantees the portal-a platform with
// the fixed dev handoff secret and the admin@cimp.dev staff login exist.
export default function globalSetup(): void {
  execSync('npm run seed', { cwd: '..', stdio: 'inherit' });
}
