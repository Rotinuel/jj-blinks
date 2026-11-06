// Database access — Neon serverless driver, direct parameterised SQL, no ORM.
//
// - Single statements go over Neon's HTTP transport (`neon()`): no socket is held open
//   between queries, which suits Vercel Functions.
// - Interactive transactions (stock reservation, payment confirmation) use a WebSocket
//   `Pool` client that lives only for the duration of the transaction.
//
// Every value that reaches SQL is passed as a bind parameter ($1, $2, ...). Never build
// SQL by concatenating request data.

const INT8 = 20;
const NUMERIC = 1700;
const DATE = 1082;

let activeDriver = null;

/** Tests inject a driver with the same { query, transaction } shape. */
export function setDriver(driver) {
  activeDriver = driver;
}

function normaliseRows(rows, fields) {
  if (!rows?.length || !fields?.length) return rows ?? [];
  const toNumber = [];
  const toDate = [];
  for (const f of fields) {
    if (f.dataTypeID === INT8 || f.dataTypeID === NUMERIC) toNumber.push(f.name);
    else if (f.dataTypeID === DATE) toDate.push(f.name);
  }
  for (const row of rows) {
    for (const k of toNumber) if (row[k] !== null && row[k] !== undefined) row[k] = Number(row[k]);
    for (const k of toDate) {
      const v = row[k];
      if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        row[k] = `${y}-${m}-${d}`;
      }
    }
    for (const k of Object.keys(row)) if (row[k] instanceof Date) row[k] = row[k].toISOString();
  }
  return rows;
}

function createNeonDriver(url) {
  let modPromise = null;
  let httpSql = null;
  const load = () => (modPromise ??= import('@neondatabase/serverless'));

  return {
    async query(text, params = []) {
      const { neon } = await load();
      httpSql ??= neon(url, { fullResults: true });
      const res = await httpSql.query(text, params, { fullResults: true });
      return normaliseRows(res.rows, res.fields);
    },
    async transaction(fn) {
      const { Pool } = await load();
      const pool = new Pool({ connectionString: url });
      const client = await pool.connect();
      const tx = {
        async query(text, params = []) {
          const res = await client.query(text, params);
          return normaliseRows(res.rows, res.fields);
        },
      };
      try {
        await client.query('BEGIN');
        const result = await fn(withHelpers(tx));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* connection may be gone */ }
        throw err;
      } finally {
        client.release();
        await pool.end();
      }
    },
  };
}

function getDriver() {
  if (activeDriver) return activeDriver;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Provision Neon through the Vercel Marketplace and pull env vars with `vercel env pull .env.local`.'
    );
  }
  activeDriver = createNeonDriver(url);
  return activeDriver;
}

function withHelpers(executor) {
  return {
    query: (text, params) => executor.query(text, params),
    async one(text, params) {
      const rows = await executor.query(text, params);
      return rows[0] ?? null;
    },
  };
}

export async function query(text, params = []) {
  return getDriver().query(text, params);
}

export async function one(text, params = []) {
  const rows = await getDriver().query(text, params);
  return rows[0] ?? null;
}

/**
 * Run `fn(tx)` inside BEGIN/COMMIT. `tx.query` and `tx.one` run on the same connection.
 * Throwing inside `fn` rolls everything back.
 */
export async function transaction(fn) {
  const driver = getDriver();
  return driver.transaction(async (tx) => fn(tx.one ? tx : withHelpers(tx)));
}

export function isUniqueViolation(err) {
  return err?.code === '23505';
}

export function isCheckViolation(err) {
  return err?.code === '23514';
}

/**
 * Serialise a value for a JSONB parameter. Required for arrays: Postgres drivers send JS
 * arrays as Postgres arrays, not JSON. Use it for every JSONB bind value for consistency.
 */
export function json(value) {
  return value === undefined ? null : JSON.stringify(value);
}
