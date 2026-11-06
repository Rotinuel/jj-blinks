// Exchange-rate snapshots for indicative pricing (and USD charging, when enabled).
import { json, one, query } from './db.js';
import { FX_SOURCE_URL, isSnapshotFresh, parseErApiResponse } from './currency.js';

const REFRESH_AFTER_HOURS = 12;

/**
 * Current usable snapshot according to settings, or null. Refreshes the live source at most
 * every 12 hours; failures fall back to the last stored snapshot while it is still fresh.
 */
export async function currentFxSnapshot(settings) {
  const source = settings?.currency?.fx_source || 'none';
  if (source === 'none') return null;

  if (source === 'manual') {
    const rates = {};
    for (const [c, r] of Object.entries(settings.currency.manual_rates || {})) {
      const n = Number(r);
      if (Number.isFinite(n) && n > 0) rates[c] = n;
    }
    if (!Object.keys(rates).length) return null;
    return { rates, source: 'manual', fetched_at: settings.currency.manual_updated_at || null, source_updated_at: settings.currency.manual_updated_at || null };
  }

  const last = await one(
    `SELECT rates, source, source_updated_at, fetched_at FROM fx_snapshots
      WHERE source = 'open.er-api.com' ORDER BY fetched_at DESC LIMIT 1`
  );
  const age = last ? Date.now() - new Date(last.fetched_at).getTime() : Infinity;
  if (age < REFRESH_AFTER_HOURS * 3600 * 1000) return isSnapshotFresh(last) ? last : null;

  try {
    const res = await fetch(FX_SOURCE_URL, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snap = parseErApiResponse(await res.json());
    const saved = await one(
      `INSERT INTO fx_snapshots (base, rates, source, source_updated_at) VALUES ('NGN', $1, $2, $3)
       RETURNING rates, source, source_updated_at, fetched_at`,
      [json(snap.rates), snap.source, snap.source_updated_at]
    );
    return saved;
  } catch (err) {
    console.warn('FX refresh failed:', err?.message);
    return last && isSnapshotFresh(last) ? last : null;
  }
}

export async function recentFxSnapshots(limit = 10) {
  return query('SELECT id, rates, source, source_updated_at, fetched_at FROM fx_snapshots ORDER BY fetched_at DESC LIMIT $1', [limit]);
}
