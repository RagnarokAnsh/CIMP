import * as jwt from 'jsonwebtoken';

// Mint a hand-off token for local testing.
// Usage: npm run token -- <platformKey> <secret> <portalUserId> <name> <email>
const [platformKey = 'portal-a', secret = 'dev-secret-portal-a',
  portalUserId = 'u-1001', name = 'Asha Rao', email = 'asha@example.org'] =
  process.argv.slice(2);

const token = jwt.sign(
  { platformKey, portalUserId, name, email },
  secret,
  { algorithm: 'HS256', expiresIn: '5m' },
);

console.log(token);
