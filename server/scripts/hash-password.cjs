const { randomBytes, scryptSync } = require('node:crypto');
const password = process.argv[2];
if (!password || password.length < 12) {
  process.stderr.write('Usage: node scripts/hash-password.cjs <password-at-least-12-characters>\n');
  process.exit(1);
}
const salt = randomBytes(16).toString('hex');
process.stdout.write(`${salt}:${scryptSync(password, salt, 64).toString('hex')}\n`);
