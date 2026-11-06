// TEST-ONLY database driver.
// Talks to a local PostgreSQL through a persistent `psql` session so the real SQL in lib/
// can be exercised without network access to Neon. Parameters are inlined as escaped
// literals — acceptable for tests against a throwaway database, never used by the app.
import { spawn } from 'node:child_process';

function quote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function literal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Non-finite number parameter');
    return String(v);
  }
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return quote(v.toISOString());
  if (Array.isArray(v)) {
    const items = v.map((i) => (i === null ? 'NULL' : '"' + String(i).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'));
    return quote('{' + items.join(',') + '}');
  }
  if (typeof v === 'object') return quote(JSON.stringify(v));
  return quote(v);
}

export function interpolate(text, params = []) {
  return text.replace(/\$(\d+)/g, (_, n) => {
    const i = Number(n) - 1;
    if (i < 0 || i >= params.length) throw new Error(`Missing parameter $${n}`);
    return literal(params[i]);
  });
}

function wrap(sqlText) {
  const s = sqlText.trim().replace(/;\s*$/, '');
  if (/^(select|values)\b/i.test(s) || (/^with\b/i.test(s) && !/\b(insert|update|delete)\b/i.test(s))) {
    return { sql: `SELECT coalesce(json_agg(__t), '[]'::json) FROM (${s}) __t`, returns: true };
  }
  if (/^(insert|update|delete)\b/i.test(s) && /\breturning\b/i.test(s)) {
    return { sql: `WITH __t AS (${s}) SELECT coalesce(json_agg(__t), '[]'::json) FROM __t`, returns: true };
  }
  return { sql: s, returns: false };
}

export function createPsqlDriver(url) {
  const proc = spawn('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=0', url], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  let waiter = null;
  let chain = Promise.resolve();

  const check = () => {
    if (!waiter) return;
    const m = out.match(/__JJBEND__ (true|false) (\S*)\n/);
    if (!m || !err.includes('__JJBWEND__\n')) return;
    const body = out.slice(0, m.index);
    const errText = err.slice(0, err.indexOf('__JJBWEND__'));
    out = out.slice(m.index + m[0].length);
    err = err.slice(err.indexOf('__JJBWEND__\n') + '__JJBWEND__\n'.length);
    const w = waiter;
    waiter = null;
    w({ body, isError: m[1] === 'true', sqlstate: m[2], errText });
  };
  proc.stdout.on('data', (d) => { out += d.toString(); check(); });
  proc.stderr.on('data', (d) => { err += d.toString(); check(); });

  const run = (sqlText) =>
    (chain = chain.then(
      () =>
        new Promise((resolve) => {
          waiter = resolve;
          proc.stdin.write(`${sqlText};\n\\echo __JJBEND__ :ERROR :SQLSTATE\n\\warn __JJBWEND__\n`);
        })
    ));

  async function query(text, params = []) {
    const { sql, returns } = wrap(interpolate(text, params));
    const r = await run(sql);
    if (r.isError) {
      const e = new Error(r.errText.replace(/^psql:[^\n]*?ERROR:\s*/m, '').trim() || 'SQL error');
      e.code = r.sqlstate;
      throw e;
    }
    if (!returns) return [];
    const json = r.body.trim();
    return json ? JSON.parse(json) : [];
  }

  return {
    query,
    async transaction(fn) {
      await query('BEGIN');
      try {
        const result = await fn({ query });
        await query('COMMIT');
        return result;
      } catch (e) {
        await query('ROLLBACK').catch(() => {});
        throw e;
      }
    },
    async close() {
      proc.stdin.end('\\q\n');
      await new Promise((r) => proc.on('close', r));
    },
  };
}
