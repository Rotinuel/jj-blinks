// Apply pending SQL migrations in db/migrations, in filename order, each in its own transaction.
// Usage: bun run db:migrate
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { query, transaction } from '../lib/db.js';
import { setupScriptDb } from './_setup.js';

const close = await setupScriptDb();
const dir = path.join(import.meta.dirname, '..', 'db', 'migrations');

await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);
const done = new Set((await query('SELECT name FROM schema_migrations')).map((r) => r.name));
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

let applied = 0;
for (const file of files) {
  if (done.has(file)) continue;
  const sql = await readFile(path.join(dir, file), 'utf8');
  process.stdout.write(`Applying ${file} … `);
  await transaction(async (tx) => {
    await tx.query(sql);
    await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
  });
  console.log('done');
  applied++;
}
console.log(applied ? `${applied} migration(s) applied.` : 'Database is up to date.');
await close();
