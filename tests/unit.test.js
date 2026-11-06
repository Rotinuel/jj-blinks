// Pure-logic tests. Run: bun run test:unit  (or: node --test tests/unit.test.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';

import {
  chargeAmountUsdCents, convertKobo, formatMoney, indicativePrice, isSnapshotFresh, parseErApiResponse, parseNairaToKobo,
} from '../lib/currency.js';
import { computeTotals, evaluateCoupon, lineTotalKobo, unitPriceKobo, validateCustomizations, comparePriceKobo } from '../lib/pricing.js';
import { priceMethod, resolveZone, deliveryEstimateText } from '../lib/shipping.js';
import { normalizeEmail, normalizePhone, validate, validateAddress, validatePassword } from '../lib/validation.js';
import { addressFormat, validatePostal, countryName, listCountries } from '../lib/countries.js';
import { can, canAssignRole, PERMISSIONS } from '../lib/permissions.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { verifySignature, sanitizeEvent } from '../lib/payments/paystack.js';
import { sniffType, validateUpload } from '../lib/storage/index.js';
import { sanitizeCartItems } from '../lib/orders.js';
import { canTransition } from '../lib/order-admin.js';
import { canRequestTransition } from '../lib/custom-requests.js';
import { slugify, whatsappLink, orderNumber } from '../lib/utilities.js';

test('naira parsing to integer kobo', () => {
  assert.equal(parseNairaToKobo('12,500'), 1250000);
  assert.equal(parseNairaToKobo('₦99.5'), 9950);
  assert.equal(parseNairaToKobo('0.01'), 1);
  assert.equal(parseNairaToKobo('1.234'), null);
  assert.equal(parseNairaToKobo('-5'), null);
  assert.equal(parseNairaToKobo('abc'), null);
});

test('money formatting', () => {
  assert.match(formatMoney(1250000, 'NGN'), /12,500/);
  assert.match(formatMoney(1999, 'USD', { approx: true }), /^≈ .*19\.99/);
});

test('indicative conversion uses stored rate and refuses stale or missing rates', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  const snap = { rates: { USD: 0.00065, GBP: 0.0005 }, source: 'open.er-api.com', fetched_at: '2026-11-04T01:00:00Z', source_updated_at: '2026-11-04T00:02:31Z' };
  const p = indicativePrice(1500000, 'USD', snap, now); // ₦15,000
  assert.equal(p.amountMinor, 975); // $9.75
  assert.equal(p.currency, 'USD');
  assert.equal(indicativePrice(1500000, 'EUR', snap, now), null, 'missing rate → no conversion');
  assert.equal(indicativePrice(1500000, 'NGN', snap, now), null);
  const stale = { ...snap, source_updated_at: '2026-10-30T00:00:00Z' };
  assert.equal(isSnapshotFresh(stale, now), false);
  assert.equal(indicativePrice(1500000, 'USD', stale, now), null, 'stale → no conversion');
  assert.equal(convertKobo(100, 0), null);
  assert.equal(chargeAmountUsdCents(1500001, 0.00065), 976, 'USD charge rounds up');
});

test('exchange-rate response parsing is strict', () => {
  const snap = parseErApiResponse({ result: 'success', base_code: 'NGN', time_last_update_unix: 1762214551, rates: { USD: 0.00065, GBP: 0.0005, EUR: 0.00056, CAD: 0.0009, JPY: 0.1 } });
  assert.deepEqual(Object.keys(snap.rates).sort(), ['CAD', 'EUR', 'GBP', 'USD']);
  assert.throws(() => parseErApiResponse({ result: 'error' }));
  assert.throws(() => parseErApiResponse({ result: 'success', base_code: 'USD', rates: { NGN: 1500 } }));
});

test('unit prices, compare prices and line totals', () => {
  const product = { price_kobo: 1000000, compare_at_kobo: 1200000 };
  assert.equal(unitPriceKobo(product, null), 1000000);
  assert.equal(unitPriceKobo(product, { price_kobo: 1100000 }), 1100000);
  assert.equal(unitPriceKobo(product, { price_kobo: null }), 1000000);
  assert.equal(comparePriceKobo(product, { price_kobo: 1300000 }), null, 'no fake discount when compare <= price');
  assert.equal(lineTotalKobo(1000000, 3), 3000000);
});

test('coupon rules', () => {
  const base = { is_active: true, used_count: 0, min_subtotal_kobo: 0 };
  assert.deepEqual(evaluateCoupon({ ...base, type: 'percent', value: 10 }, { subtotalKobo: 50000, shippingKobo: 0 }).discountKobo, 5000);
  assert.equal(evaluateCoupon({ ...base, type: 'percent', value: 50, max_discount_kobo: 1000 }, { subtotalKobo: 50000 }).discountKobo, 1000);
  assert.equal(evaluateCoupon({ ...base, type: 'fixed', value: 999999 }, { subtotalKobo: 50000 }).discountKobo, 50000, 'never exceeds subtotal');
  assert.equal(evaluateCoupon({ ...base, type: 'free_shipping', value: 0 }, { subtotalKobo: 1, shippingKobo: 3000 }).shippingDiscountKobo, 3000);
  assert.equal(evaluateCoupon({ ...base, type: 'percent', value: 10, min_subtotal_kobo: 100000 }, { subtotalKobo: 50000 }).ok, false);
  assert.equal(evaluateCoupon({ ...base, type: 'percent', value: 10, usage_limit: 5, used_count: 5 }, { subtotalKobo: 50000 }).ok, false);
  assert.equal(evaluateCoupon({ ...base, type: 'percent', value: 10, usage_limit_per_email: 1 }, { subtotalKobo: 5, email: 'a@b.co', priorUsesByEmail: 1 }).ok, false);
  assert.equal(evaluateCoupon({ ...base, type: 'percent', value: 10, ends_at: '2020-01-01T00:00:00Z' }, { subtotalKobo: 5 }).ok, false);
  assert.equal(evaluateCoupon({ ...base, is_active: false, type: 'percent', value: 10 }, { subtotalKobo: 5 }).ok, false);
  assert.equal(evaluateCoupon(null, { subtotalKobo: 5 }).ok, false);
});

test('totals', () => {
  assert.deepEqual(computeTotals({ subtotalKobo: 10000, discountKobo: 1000, shippingKobo: 2000 }), {
    subtotalKobo: 10000, discountKobo: 1000, shippingKobo: 2000, totalKobo: 11000,
  });
  const fs = computeTotals({ subtotalKobo: 10000, shippingDiscountKobo: 2000, shippingKobo: 2000 });
  assert.equal(fs.totalKobo, 10000);
  assert.equal(fs.discountKobo, 2000);
  assert.equal(computeTotals({ subtotalKobo: 10000, shippingKobo: null }).totalKobo, null, 'quote pending → no total');
});

test('customisation validation', () => {
  const opts = [
    { key: 'text', label: 'Text', type: 'text', required: true, max_length: 5 },
    { key: 'colour', label: 'Thread', type: 'select', choices: ['Gold', 'Silver'] },
  ];
  assert.deepEqual(validateCustomizations(opts, { text: 'Ada', colour: 'Gold', junk: 'x' }), { values: { text: 'Ada', colour: 'Gold' }, errors: [] });
  assert.equal(validateCustomizations(opts, {}).errors.length, 1);
  assert.equal(validateCustomizations(opts, { text: 'toolongtext' }).errors.length, 1);
  assert.equal(validateCustomizations(opts, { text: 'ok', colour: 'Purple' }).errors.length, 1);
});

test('shipping method pricing', () => {
  const flat = { is_active: true, type: 'flat', flat_rate_kobo: 300000, free_over_kobo: 10000000 };
  assert.equal(priceMethod(flat, { subtotalKobo: 500000 }).rateKobo, 300000);
  assert.equal(priceMethod(flat, { subtotalKobo: 10000000 }).rateKobo, 0, 'free over threshold');
  const weight = { is_active: true, type: 'weight', rate_table: [{ max_grams: 3000, rate_kobo: 45 }, { max_grams: 1000, rate_kobo: 25 }] };
  assert.equal(priceMethod(weight, { subtotalKobo: 1, weightGrams: 800 }).rateKobo, 25);
  assert.equal(priceMethod(weight, { subtotalKobo: 1, weightGrams: 1001 }).rateKobo, 45);
  assert.equal(priceMethod(weight, { subtotalKobo: 1, weightGrams: 5000 }).requiresQuote, true, 'too heavy → quote');
  assert.equal(priceMethod(weight, { subtotalKobo: 1, weightGrams: null }).requiresQuote, true, 'unknown weight → quote');
  const value = { is_active: true, type: 'order_value', rate_table: [{ min_subtotal_kobo: 0, rate_kobo: 500 }, { min_subtotal_kobo: 10000, rate_kobo: 200 }] };
  assert.equal(priceMethod(value, { subtotalKobo: 9999 }).rateKobo, 500);
  assert.equal(priceMethod(value, { subtotalKobo: 10000 }).rateKobo, 200);
  assert.equal(priceMethod({ is_active: true, type: 'pickup' }, {}).rateKobo, 0);
  assert.equal(priceMethod({ is_active: true, type: 'quote' }, {}).requiresQuote, true);
  assert.equal(priceMethod({ ...flat, is_active: false }, {}).available, false);
  assert.equal(deliveryEstimateText({ est_days_min: 2, est_days_max: 5 }), '2–5 business days');
});

test('shipping zone resolution and restricted destinations', () => {
  const zones = [
    { id: 1, is_active: true, countries: ['NG'] },
    { id: 2, is_active: false, countries: ['GB'] },
    { id: 3, is_active: true, is_fallback: true, countries: [] },
  ];
  assert.equal(resolveZone('ng', zones).zone.id, 1);
  assert.equal(resolveZone('GB', zones).status, 'unavailable', 'listed but inactive zone does not fall back');
  assert.equal(resolveZone('FR', zones).zone.id, 3);
  assert.equal(resolveZone('FR', zones, ['FR']).status, 'blocked');
  assert.equal(resolveZone('FR', zones.slice(0, 2)).status, 'unavailable');
});

test('international phone and postal validation', () => {
  assert.equal(normalizePhone('0803 224 2010', 'NG'), '+2348032242010');
  assert.equal(normalizePhone('+44 7700 900123', 'NG'), '+447700900123');
  assert.equal(normalizePhone('0044 7700 900123', 'US'), '+447700900123');
  assert.equal(normalizePhone('(415) 555-2671', 'US'), '+14155552671');
  assert.equal(normalizePhone('12345', 'NG'), null);
  assert.equal(normalizePhone('5551234', 'ZZ'), null, 'no dial code known and no + → rejected');
  assert.equal(validatePostal('US', '94105').ok, true);
  assert.equal(validatePostal('US', '9410').ok, false);
  assert.equal(validatePostal('GB', 'SW1A 1AA').value, 'SW1A 1AA');
  assert.equal(validatePostal('CA', 'K1A0B1').ok, true);
  assert.equal(validatePostal('GB', '').ok, false, 'required in GB');
  assert.equal(validatePostal('NG', '').ok, true, 'optional in NG');
  assert.equal(addressFormat('AE').postal, 'hidden');
  assert.equal(addressFormat('NG').regionOptions.length, 37);
});

test('address validation is country-aware', () => {
  const uk = validateAddress({ full_name: 'Ada O', phone: '+447700900123', country_code: 'GB', city: 'London', line1: '1 High St', postal_code: 'SW1A1AA' });
  assert.equal(uk.ok, true, JSON.stringify(uk.errors));
  const ngBad = validateAddress({ full_name: 'Ada', phone: '08032242010', country_code: 'NG', city: 'Abeokuta', line1: '4 Street', region: 'Texas' });
  assert.equal(ngBad.ok, false);
  assert.ok(ngBad.errors.region);
  const ng = validateAddress({ full_name: 'Ada', phone: '08032242010', country_code: 'NG', city: 'Abeokuta', line1: '4 Street', region: 'Ogun' });
  assert.equal(ng.ok, true);
  assert.equal(ng.address.phone, '+2348032242010');
  assert.equal(validateAddress({ country_code: 'XX' }).errors.country_code, 'Choose your country.');
  assert.equal(countryName('GB'), 'United Kingdom');
  assert.ok(listCountries().length > 230);
});

test('generic validators', () => {
  assert.equal(normalizeEmail(' Ada@Example.COM '), 'ada@example.com');
  assert.equal(normalizeEmail('nope@'), null);
  const r = validate({ qty: '3', kind: 'bulk', name: '' }, { qty: { type: 'int', min: 1, max: 10 }, kind: { type: 'enum', values: ['custom', 'bulk'] }, name: { required: true } });
  assert.equal(r.data.qty, 3);
  assert.equal(r.data.kind, 'bulk');
  assert.ok(r.errors.name);
  assert.ok(validate({ q: '1.5' }, { q: { type: 'int' } }).errors.q);
  assert.equal(validatePassword('short1'), 'Use at least 10 characters.');
  assert.equal(validatePassword('longenoughpassword'), 'Include at least one letter and one number.');
  assert.equal(validatePassword('longenough123'), null);
});

test('permission map', () => {
  assert.equal(can('super_admin', 'staff.manage'), true);
  assert.equal(can('admin', 'staff.manage'), false);
  assert.equal(can('admin', 'settings.payments'), false);
  assert.equal(can('inventory_manager', 'products.edit'), true);
  assert.equal(can('inventory_manager', 'orders.view'), false);
  assert.equal(can('inventory_manager', 'products.cost'), false, 'cost prices restricted');
  assert.equal(can('inventory_manager', 'finance.view'), false);
  assert.equal(can('order_manager', 'orders.update'), true);
  assert.equal(can('order_manager', 'products.edit'), false);
  assert.equal(can('order_manager', 'orders.refund'), false);
  assert.equal(can('customer', 'dashboard.view'), false);
  assert.equal(can(undefined, 'dashboard.view'), false);
  assert.equal(canAssignRole('admin', 'super_admin'), false);
  assert.equal(canAssignRole('super_admin', 'order_manager'), true);
  assert.deepEqual(PERMISSIONS.customer, []);
});

test('password hashing uses scrypt and verifies', async () => {
  const h = await hashPassword('correct horse 123');
  assert.match(h, /^scrypt\$131072\$8\$1\$/);
  assert.equal(await verifyPassword('correct horse 123', h), true);
  assert.equal(await verifyPassword('wrong horse 123', h), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
  assert.notEqual(await hashPassword('same'), await hashPassword('same'), 'salted');
});

test('Paystack webhook signature (HMAC-SHA512 of raw body)', () => {
  const key = 'sk_test_example';
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'R1' } });
  const sig = createHmac('sha512', key).update(body).digest('hex');
  assert.equal(verifySignature(body, sig, key), true);
  assert.equal(verifySignature(body + ' ', sig, key), false, 'tampered body');
  assert.equal(verifySignature(body, sig.replace(/.$/, '0'), key), sig.endsWith('0'));
  assert.equal(verifySignature(body, undefined, key), false);
  assert.equal(verifySignature(body, sig, ''), false, 'no secret → reject');
  const clean = sanitizeEvent({ event: 'charge.success', data: { reference: 'R1', authorization: { last4: '4081', bin: '408408' }, customer: { email: 'a@b.c' } } });
  assert.equal(JSON.stringify(clean).includes('4081'), false, 'card data stripped');
});

test('upload validation sniffs real file type', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(20)]);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(sniffType(png), 'image/png');
  assert.equal(sniffType(jpg), 'image/jpeg');
  assert.equal(validateUpload(svg, 'product').ok, false, 'SVG rejected');
  assert.equal(validateUpload(pdf, 'product').ok, false, 'PDF not allowed for product images');
  assert.equal(validateUpload(pdf, 'logo').ok, true, 'PDF allowed for logos');
  assert.equal(validateUpload(Buffer.alloc(5 * 1024 * 1024, 0xff), 'product').ok, false, 'too large');
  assert.equal(validateUpload(png, 'nonsense').ok, false);
});

test('cart input sanitising ignores client prices and clamps quantities', () => {
  const items = sanitizeCartItems([
    { productId: 5, quantity: 1000, price: 1, unitPriceKobo: 1 },
    { productId: 5, quantity: 2 },
    { productId: '6', variantId: '9', quantity: -3, customizations: { note: ' hi ', 'bad key': 'x', n: 5 } },
    { productId: 'drop table' },
    { productId: 0 },
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].quantity, 50, 'merged and clamped to max');
  assert.equal('price' in items[0], false);
  assert.deepEqual(items[1], { key: items[1].key, productId: 6, variantId: 9, quantity: 1, customizations: { note: 'hi' } });
  assert.deepEqual(sanitizeCartItems('nope'), []);
});

test('status transition rules', () => {
  assert.equal(canTransition('pending_payment', 'paid'), false, 'staff can never mark paid');
  assert.equal(canTransition('pending_payment', 'shipped'), false);
  assert.equal(canTransition('paid', 'processing'), true);
  assert.equal(canTransition('shipped', 'delivered'), true);
  assert.equal(canTransition('delivered', 'cancelled'), false);
  assert.equal(canRequestTransition('new', 'approved'), false, 'cannot approve without a quote step');
  assert.equal(canRequestTransition('quoted', 'approved'), true);
  assert.equal(canRequestTransition('approved', 'in_production'), true);
});

test('utilities', () => {
  assert.equal(slugify("Traditional Men's Caps & Hats"), 'traditional-men-s-caps-and-hats');
  assert.equal(whatsappLink('+234 803 224 2010', 'Hello & welcome?'), 'https://wa.me/2348032242010?text=Hello%20%26%20welcome%3F');
  assert.match(orderNumber('JJB', new Date('2026-11-04T00:00:00Z')), /^JJB-261104-[A-Z2-9]{5}$/);
});

import { parseCustomizations, parseOptions, optionsToText, customizationsToText } from '../lib/product-form.js';
test('admin product option editors round-trip', () => {
  const opts = parseOptions('Colour: Gold, Wine, Gold\nSize 58\n: x\nSize: 56, 58');
  assert.deepEqual(opts, [{ name: 'Colour', values: ['Gold', 'Wine'] }, { name: 'Size', values: ['56', '58'] }]);
  assert.equal(optionsToText(opts), 'Colour: Gold, Wine\nSize: 56, 58');
  const c = parseCustomizations('Name to print | text | required | 40\nThread | select: Gold, Silver | optional\nBad | select: |');
  assert.deepEqual(c, [
    { key: 'name_to_print', label: 'Name to print', type: 'text', required: true, max_length: 40 },
    { key: 'thread', label: 'Thread', type: 'select', required: false, choices: ['Gold', 'Silver'] },
  ]);
  assert.deepEqual(parseCustomizations(customizationsToText(c)), c);
});

import { parseIdentifier } from '../lib/validation.js';
import { authorizeUrl, configuredProviders, normaliseProfile, pkcePair, FACEBOOK_GRAPH_VERSION } from '../lib/oauth.js';
test('sign-in identifier: email or phone', () => {
  assert.deepEqual(parseIdentifier(' Ada@Example.com '), { email: 'ada@example.com' });
  assert.deepEqual(parseIdentifier('0803 224 2010'), { phone: '+2348032242010' });
  assert.deepEqual(parseIdentifier('+44 7700 900123'), { phone: '+447700900123' });
  assert.equal(parseIdentifier('ada@'), null);
  assert.equal(parseIdentifier('12345'), null);
  assert.equal(parseIdentifier(''), null);
});

test('OAuth: provider config, authorisation URLs, PKCE and profile mapping', () => {
  const env = { GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gs', FACEBOOK_APP_ID: 'fid' };
  assert.deepEqual(configuredProviders(env).map((p) => p.id), ['google'], 'Facebook needs both id and secret');
  const { verifier, challenge } = pkcePair();
  assert.ok(verifier.length >= 43);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  const g = new URL(authorizeUrl('google', { state: 'st', codeChallenge: challenge, env }));
  assert.equal(g.origin + g.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(g.searchParams.get('client_id'), 'gid');
  assert.equal(g.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(g.searchParams.get('state'), 'st');
  assert.match(g.searchParams.get('redirect_uri'), /\/api\/auth\/google\/callback$/);
  assert.equal(g.searchParams.get('scope'), 'openid email profile');
  const f = new URL(authorizeUrl('facebook', { state: 'st', env: { ...env, FACEBOOK_APP_SECRET: 'fs' } }));
  assert.equal(f.pathname, `/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`);
  assert.equal(f.searchParams.get('scope'), 'email,public_profile');
  assert.equal(f.searchParams.has('code_challenge'), false);
  assert.deepEqual(normaliseProfile('google', { sub: '1', email: 'a@b.co', email_verified: true, name: 'A' }), { providerUserId: '1', email: 'a@b.co', emailVerified: true, name: 'A' });
  assert.equal(normaliseProfile('facebook', { id: 9, email: 'a@b.co' }).emailVerified, false, 'Facebook email not trusted for linking');
  assert.equal(normaliseProfile('google', {}).providerUserId, null);
});

import { smtpConfig, emailConfigured, fromAddress, fromMismatchWarning, describeEmailError } from '../lib/email.js';
test('email settings: Gmail app password, default From, alias warning, error messages', () => {
  const gmail = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'shop@gmail.com', SMTP_PASSWORD: 'abcd efgh ijkl mnop' };
  const cfg = smtpConfig(gmail);
  assert.equal(cfg.pass, 'abcdefghijklmnop', 'spaces removed from app password');
  assert.equal(cfg.secure, true);
  assert.equal(smtpConfig({ ...gmail, SMTP_PORT: '587' }).secure, false);
  assert.equal(smtpConfig({ ...gmail, SMTP_PORT: '' }).port, 465, 'defaults to 465');
  assert.equal(emailConfigured({ ...gmail, SMTP_PASSWORD: '' }), false, 'password required');
  assert.equal(emailConfigured({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', EMAIL_FROM: 'x <a@b.co>' }), false, 'old partial config no longer counts');
  assert.equal(fromAddress(gmail, 'JJ BLINKS'), '"JJ BLINKS" <shop@gmail.com>', 'From defaults to the mailbox');
  assert.equal(fromMismatchWarning(gmail), null);
  assert.equal(fromMismatchWarning({ ...gmail, EMAIL_FROM: 'JJ BLINKS <SHOP@gmail.com>' }), null, 'case-insensitive match');
  assert.match(fromMismatchWarning({ ...gmail, EMAIL_FROM: 'JJ BLINKS <info@jjblinks.com>' }), /info@jjblinks\.com/);
  assert.match(describeEmailError({ code: 'EAUTH', response: '535-5.7.8 Username and Password not accepted' }), /app password/);
  assert.match(describeEmailError({ code: 'EMESSAGE', response: '550 5.4.5 Daily user sending limit exceeded' }), /daily sending limit/);
  assert.match(describeEmailError({ code: 'ETIMEDOUT' }), /smtp\.gmail\.com/);
  assert.match(describeEmailError({}), /could not be sent/);
});
