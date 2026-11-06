// Configurable shipping: zones → countries, per-zone methods with flat / weight / order-value /
// pickup / manual-quote pricing, free-shipping thresholds, blocked destinations.
// Rates come only from the database; nothing here invents a courier or a price.
import { query } from './db.js';

export const METHOD_TYPES = ['flat', 'weight', 'order_value', 'pickup', 'quote'];

/**
 * Pure: price one method for a cart.
 * Returns { available, requiresQuote, rateKobo, reason? }.
 */
export function priceMethod(method, { subtotalKobo, weightGrams }) {
  if (!method?.is_active) return { available: false, requiresQuote: false, rateKobo: null, reason: 'inactive' };
  const freeOver = method.free_over_kobo !== null && method.free_over_kobo !== undefined ? Number(method.free_over_kobo) : null;
  const isFree = freeOver !== null && Number(subtotalKobo) >= freeOver;
  const table = Array.isArray(method.rate_table) ? method.rate_table : [];

  switch (method.type) {
    case 'pickup':
      return { available: true, requiresQuote: false, rateKobo: 0 };
    case 'quote':
      return { available: true, requiresQuote: true, rateKobo: null };
    case 'flat': {
      if (method.flat_rate_kobo === null || method.flat_rate_kobo === undefined) {
        return { available: false, requiresQuote: false, rateKobo: null, reason: 'misconfigured' };
      }
      return { available: true, requiresQuote: false, rateKobo: isFree ? 0 : Number(method.flat_rate_kobo) };
    }
    case 'weight': {
      if (weightGrams === null || weightGrams === undefined) {
        // At least one item has no recorded weight — cannot price automatically.
        return { available: true, requiresQuote: true, rateKobo: null, reason: 'unknown_weight' };
      }
      const tiers = table
        .filter((t) => Number.isFinite(Number(t.max_grams)) && Number.isFinite(Number(t.rate_kobo)))
        .sort((a, b) => Number(a.max_grams) - Number(b.max_grams));
      const tier = tiers.find((t) => Number(weightGrams) <= Number(t.max_grams));
      if (!tier) return { available: true, requiresQuote: true, rateKobo: null, reason: 'over_max_weight' };
      return { available: true, requiresQuote: false, rateKobo: isFree ? 0 : Number(tier.rate_kobo) };
    }
    case 'order_value': {
      const tiers = table
        .filter((t) => Number.isFinite(Number(t.min_subtotal_kobo)) && Number.isFinite(Number(t.rate_kobo)))
        .sort((a, b) => Number(b.min_subtotal_kobo) - Number(a.min_subtotal_kobo));
      const tier = tiers.find((t) => Number(subtotalKobo) >= Number(t.min_subtotal_kobo));
      if (!tier) return { available: false, requiresQuote: false, rateKobo: null, reason: 'no_tier' };
      return { available: true, requiresQuote: false, rateKobo: isFree ? 0 : Number(tier.rate_kobo) };
    }
    default:
      return { available: false, requiresQuote: false, rateKobo: null, reason: 'unknown_type' };
  }
}

/**
 * Pure: choose the zone for a country.
 * zones: [{ id, is_active, is_fallback, countries: ['GB', ...] }], blocked: Set|array of codes
 */
export function resolveZone(countryCode, zones, blocked = []) {
  const cc = String(countryCode || '').toUpperCase();
  const blockedSet = blocked instanceof Set ? blocked : new Set(blocked);
  if (!cc) return { zone: null, status: 'missing_country' };
  if (blockedSet.has(cc)) return { zone: null, status: 'blocked' };
  const explicit = zones.find((z) => (z.countries || []).includes(cc));
  if (explicit) return explicit.is_active ? { zone: explicit, status: 'ok' } : { zone: null, status: 'unavailable' };
  const fallback = zones.find((z) => z.is_fallback && z.is_active);
  if (fallback) return { zone: fallback, status: 'ok' };
  return { zone: null, status: 'unavailable' };
}

export function deliveryEstimateText(method) {
  const a = method?.est_days_min;
  const b = method?.est_days_max;
  if (a === null && b === null) return null;
  if (a !== null && b !== null && a !== undefined && b !== undefined) {
    return a === b ? `${a} business day${a === 1 ? '' : 's'}` : `${a}–${b} business days`;
  }
  const n = a ?? b;
  return n === null || n === undefined ? null : `about ${n} business days`;
}

// ---------------------------------------------------------------------------
// Database-backed helpers
// ---------------------------------------------------------------------------

export async function loadShippingConfig() {
  const [zones, countries, methods, blocked] = await Promise.all([
    query('SELECT id, name, description, is_fallback, is_active, sort_order FROM shipping_zones ORDER BY sort_order, name'),
    query('SELECT zone_id, country_code FROM shipping_zone_countries'),
    query(`SELECT id, zone_id, name, type, flat_rate_kobo, rate_table, free_over_kobo, est_days_min, est_days_max,
                  carrier_name, description, is_active, sort_order
             FROM shipping_methods ORDER BY sort_order, id`),
    query('SELECT country_code, reason FROM shipping_blocked_countries ORDER BY country_code'),
  ]);
  const byZone = new Map(zones.map((z) => [z.id, { ...z, countries: [], methods: [] }]));
  for (const c of countries) byZone.get(c.zone_id)?.countries.push(c.country_code.trim());
  for (const m of methods) byZone.get(m.zone_id)?.methods.push(m);
  return { zones: [...byZone.values()], blocked };
}

/**
 * Options for a destination + cart. Returns
 * { status: 'ok'|'blocked'|'unavailable'|'missing_country', zone, options: [{ id, name, type, rateKobo, requiresQuote, estimate, ... }] }
 */
export async function shippingOptionsFor(countryCode, cart, config) {
  const cfg = config || (await loadShippingConfig());
  const { zone, status } = resolveZone(countryCode, cfg.zones, cfg.blocked.map((b) => b.country_code.trim()));
  if (!zone) return { status, zone: null, options: [] };
  const options = [];
  for (const m of zone.methods) {
    const p = priceMethod(m, cart);
    if (!p.available) continue;
    options.push({
      id: m.id,
      name: m.name,
      type: m.type,
      carrier: m.carrier_name,
      description: m.description,
      rateKobo: p.rateKobo,
      requiresQuote: p.requiresQuote,
      reason: p.reason || null,
      estimate: deliveryEstimateText(m),
      freeOverKobo: m.free_over_kobo,
    });
  }
  return { status: options.length ? 'ok' : 'unavailable', zone: { id: zone.id, name: zone.name }, options };
}
