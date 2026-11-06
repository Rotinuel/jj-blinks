'use server';

import { revalidatePath } from 'next/cache';
import { adminAction, UserError } from '@/lib/admin-action';
import { json, one, query, transaction } from '@/lib/db';
import { parseNairaToKobo, DISPLAY_CURRENCIES } from '@/lib/currency';
import { cleanString, normalizeEmail, validatePassword } from '@/lib/validation';
import { isValidCountry } from '@/lib/countries';
import { audit } from '@/lib/audit';
import { getSettings, saveSettingsSection } from '@/lib/settings';
import { canAssignRole, ROLES, STAFF_ROLES } from '@/lib/permissions';
import { hashPassword } from '@/lib/password';
import { destroyUserSessions } from '@/lib/session';
import { issueQuote, updateRequestStatus, REQUEST_STATUS_LABELS } from '@/lib/custom-requests';
import { notifyRequestQuoted, notifyRequestStatus } from '@/lib/notifications';
import { deleteFile } from '@/lib/storage';
import { currentFxSnapshot } from '@/lib/fx';
import { METHOD_TYPES } from '@/lib/shipping';
import { emailConfigured, sendEmail, templates } from '@/lib/email';

const s = (fd, k, max = 500) => cleanString(fd.get(k), max);
const on = (fd, k) => fd.get(k) === 'on';
function nairaOrNull(fd, k, label) {
  const raw = s(fd, k, 30);
  if (!raw) return null;
  const v = parseNairaToKobo(raw);
  if (v === null) throw new UserError(`Enter a valid amount for ${label}.`);
  return v;
}
function intOrNull(fd, k) {
  const raw = s(fd, k, 12);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(n) || n < 0) throw new UserError('Use whole numbers of zero or more.');
  return n;
}
/** <input type="datetime-local"> values are Lagos time (UTC+1, no daylight saving). */
function lagosToIso(v) {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new UserError('Enter a valid date and time.');
  return new Date(`${v}:00+01:00`).toISOString();
}
function countries(text) {
  const codes = [...new Set(String(text || '').toUpperCase().split(/[\s,;]+/).filter(Boolean))];
  const bad = codes.filter((c) => !isValidCountry(c));
  if (bad.length) throw new UserError(`Unknown country codes: ${bad.join(', ')}. Use two-letter codes like NG, GB, US.`);
  return codes;
}

// ---------------------------------------------------------------- customers
export async function customerActiveAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('customers.manage', `/admin/customers/${id}`, async (user) => {
    const active = formData.get('active') === 'true';
    const u = await one(`UPDATE users SET is_active = $2 WHERE id = $1 AND role = 'customer' RETURNING email`, [id, active]);
    if (!u) throw new UserError('Customer not found.');
    if (!active) await destroyUserSessions(id);
    await audit(user, active ? 'customer.activate' : 'customer.deactivate', { entityType: 'user', entityId: id });
    return { ok: active ? 'Account reactivated.' : 'Account deactivated and signed out.' };
  });
}

// ---------------------------------------------------------------- coupons
export async function saveCouponAction(formData) {
  await adminAction('coupons.manage', '/admin/coupons', async (user) => {
    const id = Number(formData.get('id')) || null;
    const code = s(formData, 'code', 32).toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new UserError('Codes use 3–32 letters, numbers, - or _.');
    const type = ['percent', 'fixed', 'free_shipping'].includes(formData.get('type')) ? formData.get('type') : null;
    if (!type) throw new UserError('Choose a discount type.');
    let value = 0;
    if (type === 'percent') {
      value = Number.parseInt(formData.get('value'), 10);
      if (!(value >= 1 && value <= 100)) throw new UserError('Percentage must be between 1 and 100.');
    } else if (type === 'fixed') {
      value = nairaOrNull(formData, 'value', 'amount');
      if (!value) throw new UserError('Enter the discount amount in naira.');
    }
    const startsAt = s(formData, 'starts_at', 20) || null;
    const endsAt = s(formData, 'ends_at', 20) || null;
    const vals = [
      code, s(formData, 'description', 200) || null, type, value, nairaOrNull(formData, 'min_subtotal', 'minimum spend') ?? 0,
      nairaOrNull(formData, 'max_discount', 'maximum discount'), lagosToIso(startsAt), lagosToIso(endsAt), intOrNull(formData, 'usage_limit') || null,
      intOrNull(formData, 'usage_limit_per_email') || null, on(formData, 'is_active'),
    ];
    if (id) {
      await query(
        `UPDATE coupons SET code=$2, description=$3, type=$4, value=$5, min_subtotal_kobo=$6, max_discount_kobo=$7, starts_at=$8, ends_at=$9,
                usage_limit=$10, usage_limit_per_email=$11, is_active=$12 WHERE id=$1`,
        [id, ...vals]
      );
    } else {
      await query(
        `INSERT INTO coupons (code, description, type, value, min_subtotal_kobo, max_discount_kobo, starts_at, ends_at, usage_limit, usage_limit_per_email, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        vals
      );
    }
    await audit(user, id ? 'coupon.update' : 'coupon.create', { entityType: 'coupon', entityId: id, details: { code, type, value } });
    return { ok: `Discount ${code} saved.` };
  });
}

export async function deleteCouponAction(formData) {
  await adminAction('coupons.manage', '/admin/coupons', async (user) => {
    const id = Number(formData.get('id'));
    const used = await one('SELECT COUNT(*)::int AS n FROM coupon_redemptions WHERE coupon_id = $1', [id]);
    if (Number(used.n) > 0) {
      await query('UPDATE coupons SET is_active = FALSE WHERE id = $1', [id]);
      return { ok: 'This code has been used, so it was deactivated instead of deleted.' };
    }
    await query('DELETE FROM coupons WHERE id = $1', [id]);
    await audit(user, 'coupon.delete', { entityType: 'coupon', entityId: id });
    return { ok: 'Discount deleted.' };
  });
}

// ---------------------------------------------------------------- reviews
export async function moderateReviewAction(formData) {
  await adminAction('reviews.moderate', '/admin/reviews', async (user) => {
    const id = Number(formData.get('id'));
    const op = String(formData.get('op'));
    if (op === 'delete') await query('DELETE FROM reviews WHERE id = $1', [id]);
    else if (op === 'approved' || op === 'rejected') {
      await query('UPDATE reviews SET status = $2, moderated_at = NOW(), moderated_by = $3 WHERE id = $1', [id, op, user.id]);
    } else throw new UserError('Unknown action.');
    await audit(user, `review.${op}`, { entityType: 'review', entityId: id });
    revalidatePath('/', 'layout');
    return { ok: op === 'approved' ? 'Review published.' : op === 'rejected' ? 'Review hidden.' : 'Review deleted.' };
  });
}

// ---------------------------------------------------------------- custom & bulk requests
export async function requestStatusAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('custom.manage', `/admin/requests/${id}`, async (user) => {
    const to = String(formData.get('status'));
    if (!REQUEST_STATUS_LABELS[to]) throw new UserError('Choose a status.');
    const note = s(formData, 'note', 1000);
    await updateRequestStatus(id, to, user, { note, visible: true });
    await audit(user, 'request.status', { entityType: 'request', entityId: id, details: { to } });
    let sent = { sent: false };
    if (on(formData, 'notify')) sent = await notifyRequestStatus(id, REQUEST_STATUS_LABELS[to], note);
    return { ok: `Request marked ${REQUEST_STATUS_LABELS[to].toLowerCase()}.${on(formData, 'notify') ? (sent.sent ? ' Customer emailed.' : ' Email not sent (not configured).') : ''}` };
  });
}

export async function issueQuoteAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('custom.quote', `/admin/requests/${id}`, async (user) => {
    const quoteKobo = nairaOrNull(formData, 'amount', 'the quotation');
    if (!quoteKobo) throw new UserError('Enter the quotation amount.');
    const validUntil = s(formData, 'valid_until', 10) || null;
    if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) throw new UserError('Enter a valid date.');
    await issueQuote(id, { quoteKobo, notes: s(formData, 'notes', 2000), validUntil }, user);
    await audit(user, 'request.quote', { entityType: 'request', entityId: id, details: { quote_kobo: quoteKobo } });
    const sent = await notifyRequestQuoted(id);
    return { ok: sent.sent ? 'Quotation issued and emailed.' : 'Quotation issued. Email is not configured — share the customer link.' };
  });
}

export async function requestNotesAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('custom.manage', `/admin/requests/${id}`, async (user) => {
    await query('UPDATE custom_requests SET internal_notes = $2 WHERE id = $1', [id, s(formData, 'internal_notes', 4000) || null]);
    await audit(user, 'request.notes', { entityType: 'request', entityId: id });
    return { ok: 'Notes saved.' };
  });
}

// ---------------------------------------------------------------- shipping
export async function saveZoneAction(formData) {
  await adminAction('shipping.manage', '/admin/shipping', async (user) => {
    const id = Number(formData.get('id')) || null;
    const name = s(formData, 'name', 80);
    if (!name) throw new UserError('Zone name is required.');
    const fallback = on(formData, 'is_fallback');
    const codes = fallback ? [] : countries(formData.get('countries'));
    await transaction(async (tx) => {
      if (fallback) await tx.query('UPDATE shipping_zones SET is_fallback = FALSE WHERE is_fallback AND id IS DISTINCT FROM $1', [id]);
      const zone = id
        ? await tx.one('UPDATE shipping_zones SET name=$2, description=$3, is_active=$4, is_fallback=$5, sort_order=$6 WHERE id=$1 RETURNING id', [id, name, s(formData, 'description', 300) || null, on(formData, 'is_active'), fallback, Number(formData.get('sort_order')) || 0])
        : await tx.one('INSERT INTO shipping_zones (name, description, is_active, is_fallback, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, s(formData, 'description', 300) || null, on(formData, 'is_active'), fallback, Number(formData.get('sort_order')) || 0]);
      await tx.query('DELETE FROM shipping_zone_countries WHERE zone_id = $1', [zone.id]);
      for (const cc of codes) {
        const taken = await tx.one('SELECT z.name FROM shipping_zone_countries c JOIN shipping_zones z ON z.id = c.zone_id WHERE c.country_code = $1', [cc]);
        if (taken) throw new UserError(`${cc} is already in the zone "${taken.name}". A country can belong to one zone.`);
        await tx.query('INSERT INTO shipping_zone_countries (zone_id, country_code) VALUES ($1, $2)', [zone.id, cc]);
      }
    });
    await audit(user, id ? 'shipping.zone_update' : 'shipping.zone_create', { entityType: 'zone', entityId: id, details: { name, countries: codes } });
    return { ok: 'Zone saved.' };
  });
}

export async function deleteZoneAction(formData) {
  await adminAction('shipping.manage', '/admin/shipping', async (user) => {
    const id = Number(formData.get('id'));
    await query('DELETE FROM shipping_zones WHERE id = $1', [id]);
    await audit(user, 'shipping.zone_delete', { entityType: 'zone', entityId: id });
    return { ok: 'Zone deleted.' };
  });
}

export async function saveMethodAction(formData) {
  await adminAction('shipping.manage', '/admin/shipping', async (user) => {
    const id = Number(formData.get('id')) || null;
    const zoneId = Number(formData.get('zone_id'));
    const type = String(formData.get('type'));
    if (!METHOD_TYPES.includes(type)) throw new UserError('Choose a pricing type.');
    const name = s(formData, 'name', 80);
    if (!name) throw new UserError('Method name is required.');
    let table = [];
    const flat = type === 'flat' ? nairaOrNull(formData, 'flat_rate', 'the flat rate') : null;
    if (type === 'flat' && flat === null) throw new UserError('Enter the flat rate (0 for free).');
    if (type === 'weight' || type === 'order_value') {
      // One tier per line: "1000 = 25000" (grams = ₦) or "50000 = 3000" (min order ₦ = ₦)
      for (const line of String(formData.get('rate_table') || '').split('\n')) {
        const [a, b] = line.split('=').map((x) => x?.trim());
        if (!a || !b) continue;
        const rate = parseNairaToKobo(b);
        if (rate === null) throw new UserError(`Invalid rate in "${line}".`);
        if (type === 'weight') {
          const g = Number.parseInt(a, 10);
          if (!(g > 0)) throw new UserError(`Invalid weight in "${line}".`);
          table.push({ max_grams: g, rate_kobo: rate });
        } else {
          const min = parseNairaToKobo(a);
          if (min === null) throw new UserError(`Invalid minimum in "${line}".`);
          table.push({ min_subtotal_kobo: min, rate_kobo: rate });
        }
      }
      if (!table.length) throw new UserError('Add at least one rate tier.');
    }
    const dmin = intOrNull(formData, 'est_days_min');
    const dmax = intOrNull(formData, 'est_days_max');
    if (dmin !== null && dmax !== null && dmin > dmax) throw new UserError('Minimum days must not exceed maximum days.');
    const vals = [
      zoneId, name, type, flat, json(table), type === 'pickup' || type === 'quote' ? null : nairaOrNull(formData, 'free_over', 'free-shipping threshold'),
      dmin, dmax, s(formData, 'carrier_name', 80) || null, s(formData, 'description', 300) || null, on(formData, 'is_active'), Number(formData.get('sort_order')) || 0,
    ];
    if (id) {
      await query(
        `UPDATE shipping_methods SET zone_id=$2, name=$3, type=$4, flat_rate_kobo=$5, rate_table=$6, free_over_kobo=$7, est_days_min=$8, est_days_max=$9,
                carrier_name=$10, description=$11, is_active=$12, sort_order=$13 WHERE id=$1`,
        [id, ...vals]
      );
    } else {
      await query(
        `INSERT INTO shipping_methods (zone_id, name, type, flat_rate_kobo, rate_table, free_over_kobo, est_days_min, est_days_max, carrier_name, description, is_active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        vals
      );
    }
    await audit(user, id ? 'shipping.method_update' : 'shipping.method_create', { entityType: 'method', entityId: id, details: { name, type } });
    return { ok: 'Delivery method saved.' };
  });
}

export async function deleteMethodAction(formData) {
  await adminAction('shipping.manage', '/admin/shipping', async (user) => {
    const id = Number(formData.get('id'));
    await query('DELETE FROM shipping_methods WHERE id = $1', [id]);
    await audit(user, 'shipping.method_delete', { entityType: 'method', entityId: id });
    return { ok: 'Delivery method deleted.' };
  });
}

export async function blockedCountriesAction(formData) {
  await adminAction('shipping.manage', '/admin/shipping', async (user) => {
    const codes = countries(formData.get('countries'));
    await transaction(async (tx) => {
      await tx.query('DELETE FROM shipping_blocked_countries');
      for (const cc of codes) await tx.query('INSERT INTO shipping_blocked_countries (country_code, reason) VALUES ($1, $2)', [cc, s(formData, 'reason', 200) || null]);
    });
    await audit(user, 'shipping.blocked', { details: { codes } });
    return { ok: 'Restricted destinations saved.' };
  });
}

export async function shippingTextAction(formData) {
  await adminAction('shipping.manage', '/admin/shipping', async (user) => {
    const customs = s(formData, 'customs_notice', 2000);
    if (!customs) throw new UserError('Keep a customs notice for international customers.');
    await saveSettingsSection('shipping', { processing_note: s(formData, 'processing_note', 500), customs_notice: customs }, user.id);
    await audit(user, 'settings.shipping');
    revalidatePath('/', 'layout');
    return { ok: 'Shipping text saved.' };
  });
}

// ---------------------------------------------------------------- content
export async function saveHomeAction(formData) {
  await adminAction('content.manage', '/admin/content', async (user) => {
    const settings = await getSettings();
    const h = settings.home;
    const occasions = [];
    for (let i = 0; i < 6; i++) {
      const title = s(formData, `occ_title_${i}`, 80);
      if (!title) continue;
      const href = s(formData, `occ_href_${i}`, 200);
      if (href && !href.startsWith('/')) throw new UserError('Occasion links must be site paths starting with /.');
      occasions.push({ title, text: s(formData, `occ_text_${i}`, 200), href: href || '/shop' });
    }
    const home = {
      ...h,
      hero: { ...h.hero, eyebrow: s(formData, 'hero_eyebrow', 120), headline: s(formData, 'hero_headline', 160) || h.hero.headline, subheading: s(formData, 'hero_subheading', 400), image_alt: s(formData, 'hero_image_alt', 200) },
      custom_feature: { ...h.custom_feature, heading: s(formData, 'custom_heading', 120), text: s(formData, 'custom_text', 600), image_alt: s(formData, 'custom_image_alt', 200) },
      apparel: { ...h.apparel, heading: s(formData, 'apparel_heading', 120), text: s(formData, 'apparel_text', 600), image_alt: s(formData, 'apparel_image_alt', 200) },
      story: { ...h.story, heading: s(formData, 'story_heading', 120), body: s(formData, 'story_body', 4000), image_alt: s(formData, 'story_image_alt', 200) },
      occasions,
      newsletter: { enabled: on(formData, 'nl_enabled'), heading: s(formData, 'nl_heading', 120), text: s(formData, 'nl_text', 300) },
    };
    await saveSettingsSection('home', home, user.id);
    await audit(user, 'content.home');
    revalidatePath('/', 'layout');
    return { ok: 'Homepage saved.' };
  });
}

export async function removeContentImageAction(formData) {
  await adminAction('content.manage', '/admin/content', async (user) => {
    const slot = String(formData.get('slot'));
    const settings = await getSettings();
    if (!settings.home[slot]) throw new UserError('Unknown slot.');
    const url = settings.home[slot].image_url;
    await saveSettingsSection('home', { ...settings.home, [slot]: { ...settings.home[slot], image_url: null } }, user.id);
    if (url) { await deleteFile(url); await query('DELETE FROM media_assets WHERE url = $1', [url]); }
    revalidatePath('/', 'layout');
    return { ok: 'Image removed.' };
  });
}

export async function saveAnnouncementAction(formData) {
  await adminAction('content.manage', '/admin/content', async (user) => {
    const link = s(formData, 'link', 200);
    if (link && !link.startsWith('/') && !/^https:\/\//.test(link)) throw new UserError('Link must start with / or https://');
    await saveSettingsSection('announcement', { enabled: on(formData, 'enabled'), text: s(formData, 'text', 160), link }, user.id);
    await audit(user, 'content.announcement');
    revalidatePath('/', 'layout');
    return { ok: 'Announcement saved.' };
  });
}

export async function savePagesAction(formData) {
  await adminAction('content.manage', '/admin/content', async (user) => {
    const faqs = [];
    for (let i = 0; i < 12; i++) {
      const q = s(formData, `faq_q_${i}`, 200);
      const a = s(formData, `faq_a_${i}`, 1500);
      if (q && a) faqs.push({ q, a });
    }
    await saveSettingsSection('pages', { about: s(formData, 'about', 6000), returns: s(formData, 'returns', 6000), faqs }, user.id);
    await audit(user, 'content.pages');
    revalidatePath('/', 'layout');
    return { ok: 'Pages saved.' };
  });
}

// ---------------------------------------------------------------- settings
export async function saveStoreAction(formData) {
  await adminAction('settings.manage', '/admin/settings', async (user) => {
    const email = normalizeEmail(formData.get('email'));
    if (!email) throw new UserError('Enter a valid store email.');
    const whatsapp = s(formData, 'whatsapp', 20).replace(/\D/g, '');
    if (whatsapp && !/^[1-9]\d{7,14}$/.test(whatsapp)) throw new UserError('WhatsApp number must be in international format, e.g. 2348032242010.');
    await saveSettingsSection('store', {
      name: s(formData, 'name', 80) || 'JJ BLINKS', tagline: s(formData, 'tagline', 120), email,
      phone: s(formData, 'phone', 30), phone_alt: s(formData, 'phone_alt', 30), whatsapp, address: s(formData, 'address', 300), hours: s(formData, 'hours', 200),
    }, user.id);
    const social = {};
    for (const k of ['instagram', 'facebook', 'tiktok', 'x', 'youtube']) {
      const v = s(formData, `social_${k}`, 200);
      if (v && !/^https:\/\//.test(v)) throw new UserError(`The ${k} link must start with https://`);
      social[k] = v;
    }
    await saveSettingsSection('social', social, user.id);
    await audit(user, 'settings.store');
    revalidatePath('/', 'layout');
    return { ok: 'Store details saved.' };
  });
}

export async function saveCurrencyAction(formData) {
  await adminAction('settings.manage', '/admin/settings', async (user) => {
    const src = ['none', 'open_er_api', 'manual'].includes(formData.get('fx_source')) ? formData.get('fx_source') : 'none';
    const settings = await getSettings();
    const manual = {};
    let changed = false;
    for (const c of DISPLAY_CURRENCIES.filter((x) => x !== 'NGN')) {
      // Entered as "naira per 1 unit" (e.g. 1550 for USD) and stored as "units per 1 naira".
      const raw = s(formData, `rate_${c}`, 20);
      const perUnit = raw ? Number(raw.replace(/,/g, '')) : null;
      if (raw && !(perUnit > 0)) throw new UserError(`Enter a valid rate for ${c}.`);
      manual[c] = perUnit ? 1 / perUnit : null;
      if (manual[c] !== settings.currency.manual_rates?.[c]) changed = true;
    }
    if (src === 'manual' && !Object.values(manual).some(Boolean)) throw new UserError('Enter at least one manual rate, or choose another source.');
    await saveSettingsSection('currency', {
      fx_source: src, manual_rates: manual, manual_updated_at: changed ? new Date().toISOString() : settings.currency.manual_updated_at,
    }, user.id);
    await audit(user, 'settings.currency', { details: { fx_source: src } });
    revalidatePath('/', 'layout');
    return { ok: 'Currency settings saved.' };
  });
}

export async function savePaymentsAction(formData) {
  await adminAction('settings.payments', '/admin/settings', async (user) => {
    const usd = on(formData, 'usd_enabled');
    const settings = await getSettings();
    if (usd && settings.currency.fx_source === 'none') throw new UserError('Choose an exchange-rate source before enabling USD payments.');
    const windowMin = Number.parseInt(formData.get('payment_window_minutes'), 10);
    const quoteDays = Number.parseInt(formData.get('quote_payment_days'), 10);
    if (!(windowMin >= 15 && windowMin <= 1440)) throw new UserError('Payment window must be between 15 and 1440 minutes.');
    if (!(quoteDays >= 1 && quoteDays <= 30)) throw new UserError('Quotation payment time must be 1–30 days.');
    await saveSettingsSection('payments', { usd_enabled: usd, payment_window_minutes: windowMin, quote_payment_days: quoteDays }, user.id);
    await audit(user, 'settings.payments', { details: { usd_enabled: usd } });
    return { ok: 'Payment settings saved.' };
  });
}

export async function sendTestEmailAction(formData) {
  await adminAction('settings.manage', '/admin/settings', async (user) => {
    if (!emailConfigured()) {
      throw new UserError('Email is not set up yet. Add SMTP_HOST, SMTP_USER and SMTP_PASSWORD in Vercel (Settings → Environment Variables), then redeploy.');
    }
    const to = normalizeEmail(formData.get('to')) || user.email;
    const settings = await getSettings();
    const r = await sendEmail({ to, ...templates.test(settings.store.name) });
    await audit(user, 'settings.email_test', { details: { to, sent: r.sent } });
    if (!r.sent) throw new UserError(r.message || 'The test email could not be sent.');
    return { ok: `Test email sent to ${to}. Check the inbox, and the spam folder if it isn't there within a minute.` };
  });
}

export async function refreshFxAction() {
  await adminAction('settings.manage', '/admin/settings', async () => {
    const settings = await getSettings();
    if (settings.currency.fx_source !== 'open_er_api') throw new UserError('Live rates are not selected.');
    await query(`DELETE FROM fx_snapshots WHERE fetched_at > NOW() - INTERVAL '12 hours'`);
    const snap = await currentFxSnapshot(settings);
    if (!snap) throw new UserError('Could not fetch rates right now. Try again later.');
    revalidatePath('/', 'layout');
    return { ok: 'Exchange rates refreshed.' };
  });
}

// ---------------------------------------------------------------- staff
export async function addStaffAction(formData) {
  await adminAction('staff.manage', '/admin/team', async (user) => {
    const email = normalizeEmail(formData.get('email'));
    const name = s(formData, 'name', 120);
    const role = String(formData.get('role'));
    if (!email || !name) throw new UserError('Enter a name and email.');
    if (!STAFF_ROLES.includes(role) || !canAssignRole(user.role, role)) throw new UserError('Choose a staff role.');
    const existing = await one('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing) {
      await query('UPDATE users SET role = $2, is_active = TRUE WHERE id = $1', [existing.id, role]);
      await destroyUserSessions(existing.id);
    } else {
      const pw = String(formData.get('password') || '');
      const problem = validatePassword(pw);
      if (problem) throw new UserError(`Temporary password: ${problem}`);
      await query('INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)', [email, await hashPassword(pw), name, role]);
    }
    await audit(user, 'staff.add', { entityType: 'user', details: { email, role } });
    return { ok: existing ? `${email} now has the ${role.replace('_', ' ')} role.` : `Staff account created for ${email}. Share the temporary password securely and ask them to change it.` };
  });
}

export async function changeRoleAction(formData) {
  await adminAction('staff.manage', '/admin/team', async (user) => {
    const id = Number(formData.get('id'));
    const role = String(formData.get('role'));
    if (!ROLES.includes(role) || !canAssignRole(user.role, role)) throw new UserError('Choose a valid role.');
    if (id === Number(user.id) && role !== 'super_admin') throw new UserError('You cannot remove your own super admin role.');
    await transaction(async (tx) => {
      const target = await tx.one('SELECT role FROM users WHERE id = $1 FOR UPDATE', [id]);
      if (!target) throw new UserError('User not found.');
      if (target.role === 'super_admin' && role !== 'super_admin') {
        const n = await tx.one(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'super_admin' AND is_active`);
        if (Number(n.n) <= 1) throw new UserError('Keep at least one active super admin.');
      }
      await tx.query('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
      await tx.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    });
    await audit(user, 'staff.role', { entityType: 'user', entityId: id, details: { role } });
    return { ok: role === 'customer' ? 'Staff access removed.' : 'Role updated. They will need to sign in again.' };
  });
}

export async function staffActiveAction(formData) {
  await adminAction('staff.manage', '/admin/team', async (user) => {
    const id = Number(formData.get('id'));
    const active = formData.get('active') === 'true';
    if (id === Number(user.id)) throw new UserError('You cannot deactivate yourself.');
    await query('UPDATE users SET is_active = $2 WHERE id = $1', [id, active]);
    if (!active) await destroyUserSessions(id);
    await audit(user, active ? 'staff.activate' : 'staff.deactivate', { entityType: 'user', entityId: id });
    return { ok: active ? 'Account reactivated.' : 'Account deactivated and signed out.' };
  });
}

// ---------------------------------------------------------------- messages
export async function messageHandledAction(formData) {
  await adminAction('messages.view', '/admin/messages', async () => {
    await query(`UPDATE contact_messages SET status = 'handled' WHERE id = $1`, [Number(formData.get('id'))]);
    return { ok: 'Marked as handled.' };
  });
}
