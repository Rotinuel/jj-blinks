// Create the first super admin (or promote an existing account).
// Usage: ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" bun run admin:create
// The password is read from ADMIN_PASSWORD or prompted for (not echoed).
import { createInterface } from 'node:readline';
import { one, query } from '../lib/db.js';
import { hashPassword } from '../lib/password.js';
import { normalizeEmail, validatePassword } from '../lib/validation.js';
import { setupScriptDb } from './_setup.js';

function promptHidden(label) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(label)) process.stdout.write(s); };
    rl.question(label, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const email = normalizeEmail(process.env.ADMIN_EMAIL || process.argv[2]);
const name = (process.env.ADMIN_NAME || process.argv[3] || 'Store owner').trim();
if (!email) {
  console.error('Provide ADMIN_EMAIL (or pass the email as the first argument).');
  process.exit(1);
}
const password = process.env.ADMIN_PASSWORD || (await promptHidden('Password (min 10 chars, letters + numbers): '));
const problem = validatePassword(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const close = await setupScriptDb();
const hash = await hashPassword(password);
const existing = await one('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
if (existing) {
  await query(`UPDATE users SET role = 'super_admin', password_hash = $2, is_active = TRUE WHERE id = $1`, [existing.id, hash]);
  await query('DELETE FROM sessions WHERE user_id = $1', [existing.id]);
  console.log(`Existing account ${email} promoted to super_admin and password updated.`);
} else {
  await query(`INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'super_admin')`, [email, hash, name]);
  console.log(`Super admin ${email} created. Sign in at /admin/login.`);
}
await query(`INSERT INTO audit_logs (action, entity_type, details) VALUES ('staff.bootstrap', 'user', $1)`, [{ email }]);
await close();
