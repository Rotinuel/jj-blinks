// Fixed-window rate limiting stored in Postgres, so limits hold across all Vercel Function
// instances without an extra service.
import { one, query } from './db.js';
import { sha256 } from './utilities.js';

export const LIMITS = {
  login: { limit: 8, windowSeconds: 900 },
  register: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  track: { limit: 20, windowSeconds: 900 },
  checkout: { limit: 15, windowSeconds: 900 },
  customRequest: { limit: 6, windowSeconds: 3600 },
  contact: { limit: 6, windowSeconds: 3600 },
  newsletter: { limit: 6, windowSeconds: 3600 },
  upload: { limit: 30, windowSeconds: 3600 },
  review: { limit: 10, windowSeconds: 3600 },
};

/** Returns { ok, retryAfterSeconds }. `key` should identify the actor (hashed IP, email). */
export async function rateLimit(name, key) {
  const cfg = LIMITS[name];
  if (!cfg) throw new Error(`Unknown rate limit ${name}`);
  const windowMs = cfg.windowSeconds * 1000;
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  const bucket = `${name}:${sha256(key).slice(0, 32)}`;
  const row = await one(
    `INSERT INTO rate_limits (bucket, window_start, hits) VALUES ($1, $2, 1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET hits = rate_limits.hits + 1
     RETURNING hits`,
    [bucket, new Date(start).toISOString()]
  );
  const ok = Number(row.hits) <= cfg.limit;
  return { ok, retryAfterSeconds: ok ? 0 : Math.ceil((start + windowMs - Date.now()) / 1000) };
}

export async function purgeOldRateLimits() {
  await query(`DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day'`);
}
