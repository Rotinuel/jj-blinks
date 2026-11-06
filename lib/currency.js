// Currency presentation.
//
// NGN is the canonical catalogue and accounting currency. Other currencies are shown as
// INDICATIVE conversions only, computed from a stored rate snapshot with its timestamp.
// If no rate source is configured or the snapshot is stale, conversions are hidden and
// prices are shown in NGN. Exchange rates are never invented.

export const BASE_CURRENCY = 'NGN';
export const DISPLAY_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'CAD'];
export const CHARGEABLE_CURRENCIES = ['NGN', 'USD']; // only where the Paystack account allows it

/** Minor units per major unit. All five supported currencies use 2 decimals. */
export function minorFactor() {
  return 100;
}

export const FX_MAX_AGE_HOURS = 48;
export const FX_SOURCE_URL = 'https://open.er-api.com/v6/latest/NGN';
export const FX_ATTRIBUTION = { label: 'Rates By Exchange Rate API', href: 'https://www.exchangerate-api.com' };

export function formatMoney(minor, currency = 'NGN', { approx = false } = {}) {
  if (minor === null || minor === undefined || Number.isNaN(Number(minor))) return '—';
  const major = Number(minor) / minorFactor(currency);
  const s = new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en-GB', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: major % 1 === 0 && currency === 'NGN' ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
  return approx ? `≈ ${s}` : s;
}

export const formatNaira = (kobo) => formatMoney(kobo, 'NGN');

/** "12,500" or "12500.50" (naira) → kobo integer. Returns null when not a valid amount. */
export function parseNairaToKobo(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[₦,\s]/g, '').trim();
  if (s === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const kobo = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(kobo) ? kobo : null;
}

export function koboToNairaInput(kobo) {
  if (kobo === null || kobo === undefined) return '';
  const n = Number(kobo);
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
}

/**
 * Is a snapshot usable for display? `snapshot` = { rates, source, fetched_at, source_updated_at }.
 */
export function isSnapshotFresh(snapshot, now = Date.now(), maxAgeHours = FX_MAX_AGE_HOURS) {
  if (!snapshot?.rates || !snapshot.fetched_at) return false;
  if (snapshot.source === 'manual') return true; // manual rates are valid until the admin changes them
  const ref = new Date(snapshot.source_updated_at || snapshot.fetched_at).getTime();
  return Number.isFinite(ref) && now - ref <= maxAgeHours * 3600 * 1000;
}

/**
 * Convert kobo to the target currency's minor units using a rate expressed as
 * "units of target per 1 NGN". Rounds half-up to the nearest minor unit.
 */
export function convertKobo(kobo, rate) {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(Number(kobo) * rate);
}

/**
 * Returns { amountMinor, currency, rate, asOf, source } for an indicative display price,
 * or null when the price should be shown in NGN only.
 */
export function indicativePrice(kobo, currency, snapshot, now = Date.now()) {
  if (!currency || currency === BASE_CURRENCY) return null;
  if (!DISPLAY_CURRENCIES.includes(currency)) return null;
  if (!isSnapshotFresh(snapshot, now)) return null;
  const rate = Number(snapshot.rates?.[currency]);
  const amountMinor = convertKobo(kobo, rate);
  if (amountMinor === null) return null;
  return {
    amountMinor,
    currency,
    rate,
    asOf: snapshot.source_updated_at || snapshot.fetched_at,
    source: snapshot.source,
  };
}

/** Amount to charge in USD cents for an NGN total, rounding UP so the merchant is never short. */
export function chargeAmountUsdCents(kobo, usdPerNgn) {
  if (!Number.isFinite(usdPerNgn) || usdPerNgn <= 0) return null;
  return Math.ceil(Number(kobo) * usdPerNgn);
}

/** Parse the open.er-api.com response into a snapshot. Throws on anything unexpected. */
export function parseErApiResponse(json) {
  if (!json || json.result !== 'success' || json.base_code !== 'NGN' || typeof json.rates !== 'object') {
    throw new Error('Unexpected exchange-rate response');
  }
  const rates = {};
  for (const c of DISPLAY_CURRENCIES) {
    if (c === 'NGN') continue;
    const r = Number(json.rates[c]);
    if (Number.isFinite(r) && r > 0) rates[c] = r;
  }
  if (!Object.keys(rates).length) throw new Error('No usable rates in response');
  return {
    rates,
    source: 'open.er-api.com',
    source_updated_at: json.time_last_update_unix ? new Date(json.time_last_update_unix * 1000).toISOString() : null,
  };
}
