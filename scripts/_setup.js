// Shared bootstrap for CLI scripts. Bun loads .env / .env.local automatically.
// JJB_PSQL_URL (test/CI only) routes queries through a local psql session instead of Neon.
import { setDriver } from '../lib/db.js';

export async function setupScriptDb() {
  if (process.env.JJB_PSQL_URL) {
    const { createPsqlDriver } = await import('../tests/support/psql-driver.js');
    const driver = createPsqlDriver(process.env.JJB_PSQL_URL);
    setDriver(driver);
    return () => driver.close();
  }
  if (!process.env.DATABASE_URL) {
    const { existsSync } = await import('node:fs');
    const cwd = process.cwd();
    const files = ['.env', '.env.local', '.env.development', '.env.production', '.env.development.local', '.env.production.local']
      .filter((f) => existsSync(`${cwd}/${f}`));
    const lookalikes = Object.entries(process.env)
      .filter(([k, v]) => k !== 'DATABASE_URL' && typeof v === 'string' && /^postgres(ql)?:\/\//.test(v))
      .map(([k]) => k);
    console.error('DATABASE_URL is not set.\n');
    console.error(`  Folder: ${cwd}`);
    console.error(`  .env files found here: ${files.length ? files.join(', ') : 'none'}`);
    if (lookalikes.length) {
      console.error(`  A Postgres URL exists under another name: ${lookalikes.join(', ')}`);
      console.error('  Add a line DATABASE_URL=<that value> to .env.local.');
    }
    console.error('\n  Fix: run `vercel env pull .env.local` in this folder (Neon connected to the Development environment),');
    console.error('  or paste your Neon connection string into .env.local as DATABASE_URL=postgresql://…?sslmode=require');
    process.exit(1);
  }
  return async () => {};
}
