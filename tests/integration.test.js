// Integration tests against a real PostgreSQL database (the same SQL the app runs on Neon).
// Requires JJB_TEST_DATABASE_URL pointing at a THROWAWAY database — it is wiped on every run.
//   JJB_TEST_DATABASE_URL=postgresql://user:pass@localhost/jjb_test bun run test:integration
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { readdirSync } from 'node:fs';

import { setDriver, one, query, transaction } from '../lib/db.js';
import { createPsqlDriver } from './support/psql-driver.js';
import { setPaymentProvider } from '../lib/payments/index.js';
import * as paystack from '../lib/payments/paystack.js';
import {
  placeOrder, quoteCheckout, startPayment, confirmPayment, verifyAndConfirm, handleProviderWebhook,
  releaseExpiredOrders, CheckoutError,
} from '../lib/orders.js';
import { updateOrderStatus, setShippingQuote, recordRefund } from '../lib/order-admin.js';
import { createRequest, issueQuote, acceptQuote, getRequestForCustomer } from '../lib/custom-requests.js';
import { getOrderByToken, getOrderForUser, findOrderForLookup } from '../db/queries/orders.js';
import { listProducts, getProductBySlug, bestSellers } from '../db/queries/catalog.js';
import { authenticate, createSession, getSessionUser, destroySession, createPasswordResetToken, resetPasswordWithToken, registerCustomer, resolveSocialLogin, linkIdentity, unlinkIdentity, changePassword, signInMethods } from '../lib/session.js';
import { rateLimit } from '../lib/rate-limit.js';
import { DEFAULT_SETTINGS } from '../lib/settings.js';
import { sha256 } from '../lib/utilities.js';

const URL = process.env.JJB_TEST_DATABASE_URL;
const skip = !URL && 'JJB_TEST_DATABASE_URL not set';
const SECRET = 'sk_test_integration';
const settings = structuredClone(DEFAULT_SETTINGS);

// Fake provider: same interface as lib/payments/paystack.js, with a controllable verify().
const gateway = new Map();
const fakeProvider = {
  name: 'paystack',
  isConfigured: () => true,
  initialize: async ({ reference }) => ({ authorizationUrl: `https://checkout.test/${reference}`, reference }),
  verify: async (reference) => gateway.get(reference) || { status: 'ongoing', reference },
  refund: async () => ({ status: 'pending', providerReference: 'rf_1' }),
  verifySignature: (raw, sig) => paystack.verifySignature(raw, sig, SECRET),
  sanitizeEvent: paystack.sanitizeEvent,
};

let driver;
const ids = {};
const ngAddress = { full_name: 'Ada Test', phone: '+2348032242010', country_code: 'NG', region: 'Ogun', city: 'Abeokuta', postal_code: '', line1: '1 Test Street', line2: '' };
const gbAddress = { ...ngAddress, country_code: 'GB', region: '', city: 'London', postal_code: 'SW1A 1AA', phone: '+447700900123' };
const order = (over = {}) => ({
  items: [{ productId: ids.simple, quantity: 1 }],
  email: 'ada@example.test', name: 'Ada Test', phone: '+2348032242010', address: ngAddress,
  methodId: ids.ngFlat, couponCode: '', displayCurrency: 'NGN', chargeCurrency: 'NGN', ...over,
});
const stockOf = async (table, id) => Number((await one(`SELECT stock FROM ${table} WHERE id = $1`, [id])).stock);

before(async () => {
  if (skip) return;
  const dir = path.join(import.meta.dirname, '..', 'db', 'migrations');
  execFileSync('psql', [URL, '-q', '-v', 'ON_ERROR_STOP=1', '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'], { stdio: 'pipe' });
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    execFileSync('psql', [URL, '-q', '-v', 'ON_ERROR_STOP=1', '-f', path.join(dir, f)], { stdio: 'pipe' });
  }
  driver = createPsqlDriver(URL);
  setDriver(driver);
  setPaymentProvider(fakeProvider);

  const cat = await one(`INSERT INTO categories (name, slug) VALUES ('Turbans', 'turbans') RETURNING id`);
  ids.simple = (await one(
    `INSERT INTO products (category_id, name, slug, sku, price_kobo, stock, status, weight_grams) VALUES ($1, 'Velvet Turban', 'velvet-turban', 'T-1', 1500000, 50, 'published', 250) RETURNING id`, [cat.id]
  )).id;
  ids.last = (await one(
    `INSERT INTO products (category_id, name, slug, sku, price_kobo, stock, status, weight_grams) VALUES ($1, 'Last Piece', 'last-piece', 'T-2', 1000000, 1, 'published', 100) RETURNING id`, [cat.id]
  )).id;
  ids.variantProduct = (await one(
    `INSERT INTO products (category_id, name, slug, sku, price_kobo, stock, status, weight_grams, options, customization_options)
     VALUES ($1, 'Autogele', 'autogele', 'A-1', 2000000, 0, 'published', NULL, $2, $3) RETURNING id`,
    [cat.id, JSON.stringify([{ name: 'Colour', values: ['Gold', 'Wine'] }]), JSON.stringify([{ key: 'note', label: 'Note', type: 'text', required: true, max_length: 50 }])]
  )).id;
  ids.gold = (await one(`INSERT INTO product_variants (product_id, sku, option_values, price_kobo, stock) VALUES ($1, 'A-1-G', '{"Colour":"Gold"}', 2200000, 2) RETURNING id`, [ids.variantProduct])).id;
  ids.wine = (await one(`INSERT INTO product_variants (product_id, sku, option_values, stock) VALUES ($1, 'A-1-W', '{"Colour":"Wine"}', 5) RETURNING id`, [ids.variantProduct])).id;
  ids.draft = (await one(`INSERT INTO products (name, slug, sku, price_kobo, stock, status) VALUES ('Draft', 'draft', 'D-1', 100, 10, 'draft') RETURNING id`)).id;

  const ng = await one(`INSERT INTO shipping_zones (name) VALUES ('Nigeria') RETURNING id`);
  await query(`INSERT INTO shipping_zone_countries VALUES ($1, 'NG')`, [ng.id]);
  ids.ngFlat = (await one(`INSERT INTO shipping_methods (zone_id, name, type, flat_rate_kobo, free_over_kobo) VALUES ($1, 'Standard', 'flat', 300000, 10000000) RETURNING id`, [ng.id])).id;
  const gb = await one(`INSERT INTO shipping_zones (name) VALUES ('UK') RETURNING id`);
  await query(`INSERT INTO shipping_zone_countries VALUES ($1, 'GB')`, [gb.id]);
  ids.gbWeight = (await one(`INSERT INTO shipping_methods (zone_id, name, type, rate_table) VALUES ($1, 'Courier', 'weight', $2) RETURNING id`, [gb.id, JSON.stringify([{ max_grams: 2000, rate_kobo: 2500000 }])])).id;
  await query(`INSERT INTO shipping_blocked_countries VALUES ('KP', 'Not served')`);
  await query(`INSERT INTO coupons (code, type, value, usage_limit) VALUES ('TENOFF', 'percent', 10, 1)`);
  ids.customer = (await one(`INSERT INTO users (email, password_hash, name) VALUES ('cust@example.test', 'x', 'Cust') RETURNING id`)).id;
  ids.other = (await one(`INSERT INTO users (email, password_hash, name) VALUES ('other@example.test', 'x', 'Other') RETURNING id`)).id;
});

after(async () => { if (driver) await driver.close(); });

test('server re-prices the cart; client prices and drafts are ignored', { skip }, async () => {
  const q = await quoteCheckout({
    items: [{ productId: ids.simple, quantity: 2, price: 1 }, { productId: ids.draft, quantity: 1 }, { productId: 999999, quantity: 1 }],
    countryCode: 'NG', methodId: ids.ngFlat,
  });
  assert.equal(q.lines.length, 1);
  assert.equal(q.lines[0].unitPriceKobo, 1500000);
  assert.equal(q.subtotalKobo, 3000000);
  assert.equal(q.issues.filter((i) => i.type === 'unavailable').length, 2);
  assert.equal(q.totals.totalKobo, 3300000, 'subtotal + flat shipping');
});

test('variants: required, priced per variant, stock per variant, customisation enforced', { skip }, async () => {
  const noVariant = await quoteCheckout({ items: [{ productId: ids.variantProduct, quantity: 1 }], countryCode: 'NG' });
  assert.equal(noVariant.issues[0].type, 'variant_required');
  const q = await quoteCheckout({ items: [{ productId: ids.variantProduct, variantId: ids.gold, quantity: 3, customizations: {} }], countryCode: 'NG' });
  assert.equal(q.lines[0].unitPriceKobo, 2200000, 'variant price override');
  assert.deepEqual(q.issues.map((i) => i.type).sort(), ['customization', 'insufficient_stock']);
  const wine = await quoteCheckout({ items: [{ productId: ids.variantProduct, variantId: ids.wine, quantity: 1, customizations: { note: 'Hi' } }], countryCode: 'NG' });
  assert.equal(wine.lines[0].unitPriceKobo, 2000000, 'falls back to product price');
  assert.equal(wine.issues.length, 0);
  assert.equal(wine.weightGrams, null, 'unknown weight propagates');
});

test('shipping: blocked and unserved destinations, weight-based and quoted rates', { skip }, async () => {
  const kp = await quoteCheckout({ items: [{ productId: ids.simple, quantity: 1 }], countryCode: 'KP' });
  assert.equal(kp.shipping.status, 'blocked');
  const fr = await quoteCheckout({ items: [{ productId: ids.simple, quantity: 1 }], countryCode: 'FR' });
  assert.equal(fr.shipping.status, 'unavailable');
  const gb = await quoteCheckout({ items: [{ productId: ids.simple, quantity: 2 }], countryCode: 'GB', methodId: ids.gbWeight });
  assert.equal(gb.totals.shippingKobo, 2500000);
  const gbQuote = await quoteCheckout({ items: [{ productId: ids.variantProduct, variantId: ids.wine, quantity: 1, customizations: { note: 'x' } }], countryCode: 'GB', methodId: ids.gbWeight });
  assert.equal(gbQuote.requiresQuote, true, 'unknown weight → manual quote');
  assert.equal(gbQuote.totals.totalKobo, null);
  await assert.rejects(placeOrder(order({ address: { ...ngAddress, country_code: 'KP' } }), { settings }), /not able to deliver/);
});

test('guest checkout reserves stock atomically and is idempotent', { skip }, async () => {
  const before = await stockOf('products', ids.simple);
  const key = 'idem_key_0000000000001';
  const a = await placeOrder(order({ idempotencyKey: key, items: [{ productId: ids.simple, quantity: 2 }] }), { settings });
  assert.equal(a.duplicate, false);
  assert.equal(a.order.status, 'pending_payment');
  assert.equal(Number(a.order.total_kobo), 3300000);
  assert.equal(await stockOf('products', ids.simple), before - 2);
  const b = await placeOrder(order({ idempotencyKey: key, items: [{ productId: ids.simple, quantity: 2 }] }), { settings });
  assert.equal(b.duplicate, true);
  assert.equal(b.order.id, a.order.id);
  assert.equal(await stockOf('products', ids.simple), before - 2, 'no second reservation');
  ids.orderA = a.order.id;
});

test('overselling is impossible: the last piece goes to exactly one order', { skip }, async () => {
  await placeOrder(order({ items: [{ productId: ids.last, quantity: 1 }] }), { settings });
  await assert.rejects(placeOrder(order({ items: [{ productId: ids.last, quantity: 1 }] }), { settings }), (e) => e instanceof CheckoutError && e.code === 'cart_issues');
  assert.equal(await stockOf('products', ids.last), 0);
  await query('UPDATE products SET stock = 1 WHERE id = $1', [ids.last]);

  // Two concurrent sessions racing on the same conditional UPDATE: the second waits, then gets nothing.
  const d1 = createPsqlDriver(URL);
  const d2 = createPsqlDriver(URL);
  await d1.query('BEGIN');
  await d2.query('BEGIN');
  const r1 = await d1.query('UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock >= 1 RETURNING stock', [ids.last]);
  const p2 = d2.query('UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock >= 1 RETURNING stock', [ids.last]);
  await d1.query('COMMIT');
  const r2 = await p2;
  await d2.query('COMMIT');
  assert.equal(r1.length, 1);
  assert.equal(r2.length, 0, 'second buyer blocked');
  assert.equal(await stockOf('products', ids.last), 0);
  await d1.close();
  await d2.close();
});

test('coupon usage limit is enforced at order time', { skip }, async () => {
  const a = await placeOrder(order({ couponCode: 'tenoff' }), { settings });
  assert.equal(Number(a.order.discount_kobo), 150000);
  assert.equal(a.order.coupon_code, 'TENOFF');
  await assert.rejects(placeOrder(order({ couponCode: 'TENOFF', email: 'b@example.test' }), { settings }), /usage limit/);
  await assert.rejects(placeOrder(order({ couponCode: 'NOPE99' }), { settings }), /not valid/);
  ids.couponOrder = a.order.id;
});

test('payment: only a verified, matching charge marks an order paid; confirmations are idempotent', { skip }, async () => {
  const { reference, authorizationUrl } = await startPayment(ids.orderA);
  assert.match(authorizationUrl, /^https:\/\/checkout\.test\//);
  const again = await startPayment(ids.orderA);
  assert.equal(again.reference, reference, 'refresh reuses in-flight payment');

  gateway.set(reference, { status: 'ongoing', reference });
  assert.equal((await verifyAndConfirm(reference)).status, 'pending');

  const pay = await one('SELECT amount_minor, currency FROM payments WHERE reference = $1', [reference]);
  gateway.set(reference, { status: 'success', reference, amountMinor: Number(pay.amount_minor) - 100, currency: 'NGN', transactionId: '1' });
  assert.equal((await verifyAndConfirm(reference)).status, 'mismatch', 'underpayment rejected');
  let o = await one('SELECT status, payment_status, needs_attention FROM orders WHERE id = $1', [ids.orderA]);
  assert.equal(o.status, 'pending_payment');
  assert.equal(o.needs_attention, true);

  const p2 = await startPayment(ids.orderA);
  const pay2 = await one('SELECT amount_minor FROM payments WHERE reference = $1', [p2.reference]);
  gateway.set(p2.reference, { status: 'success', reference: p2.reference, amountMinor: Number(pay2.amount_minor), currency: 'NGN', transactionId: '2', channel: 'card' });
  const r = await verifyAndConfirm(p2.reference);
  assert.equal(r.status, 'paid');
  assert.equal(r.newlyPaid, true);
  assert.equal((await verifyAndConfirm(p2.reference)).status, 'already_paid');
  o = await one('SELECT status, payment_status, paid_at FROM orders WHERE id = $1', [ids.orderA]);
  assert.equal(o.status, 'paid');
  assert.ok(o.paid_at);
  assert.equal((await verifyAndConfirm('JJB-UNKNOWN-REF')).status, 'unknown');
});

test('second successful charge on a paid order is flagged, never double-fulfilled', { skip }, async () => {
  await query(`INSERT INTO payments (order_id, reference, amount_minor, currency) VALUES ($1, 'DUP-REF-0001', 3300000, 'NGN')`, [ids.orderA]);
  const r = await confirmPayment('DUP-REF-0001', { status: 'success', reference: 'DUP-REF-0001', amountMinor: 3300000, currency: 'NGN', transactionId: '3' });
  assert.equal(r.status, 'mismatch');
  const n = await one(`SELECT COUNT(*)::int AS n FROM payments WHERE order_id = $1 AND status = 'success'`, [ids.orderA]);
  assert.equal(Number(n.n), 1);
  await assert.rejects(query(`UPDATE payments SET status = 'success' WHERE reference = 'DUP-REF-0001'`), /payments_one_success_per_order/);
});

test('webhook: signature required, duplicates ignored, payment confirmed once', { skip }, async () => {
  const o = await placeOrder(order(), { settings });
  const { reference } = await startPayment(o.order.id);
  const amount = Number((await one('SELECT amount_minor FROM payments WHERE reference = $1', [reference])).amount_minor);
  gateway.set(reference, { status: 'success', reference, amountMinor: amount, currency: 'NGN', transactionId: '77' });
  const body = JSON.stringify({ event: 'charge.success', data: { id: 77, reference, amount, currency: 'NGN', authorization: { last4: '4081' } } });
  const sig = createHmac('sha512', SECRET).update(body).digest('hex');

  assert.equal((await handleProviderWebhook(body, 'bad')).httpStatus, 401);
  assert.equal((await handleProviderWebhook(body.replace('77', '78'), sig)).httpStatus, 401, 'tampered body');
  const first = await handleProviderWebhook(body, sig);
  assert.deepEqual(first, { httpStatus: 200, result: 'paid' });
  const dup = await handleProviderWebhook(body, sig);
  assert.deepEqual(dup, { httpStatus: 200, result: 'duplicate' });
  const ev = await one('SELECT payload FROM payment_events WHERE reference = $1', [reference]);
  assert.equal(JSON.stringify(ev.payload).includes('4081'), false, 'card data not stored');
  const events = await one(`SELECT COUNT(*)::int AS n FROM order_events WHERE order_id = $1 AND status = 'paid'`, [o.order.id]);
  assert.equal(Number(events.n), 1);
});

test('unpaid orders expire, release stock and coupon; a late payment re-reserves', { skip }, async () => {
  await query(`UPDATE coupons SET usage_limit = 5 WHERE code = 'TENOFF'`);
  const before = await stockOf('product_variants', ids.wine);
  const o = await placeOrder(order({ couponCode: 'TENOFF', email: 'late@example.test', items: [{ productId: ids.variantProduct, variantId: ids.wine, quantity: 2, customizations: { note: 'x' } }] }), { settings });
  assert.equal(await stockOf('product_variants', ids.wine), before - 2);
  const { reference } = await startPayment(o.order.id);
  const used = Number((await one(`SELECT used_count FROM coupons WHERE code = 'TENOFF'`)).used_count);

  await query(`UPDATE orders SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [o.order.id]);
  assert.ok((await releaseExpiredOrders()) >= 1);
  assert.equal((await one('SELECT status FROM orders WHERE id = $1', [o.order.id])).status, 'expired');
  assert.equal(await stockOf('product_variants', ids.wine), before, 'stock restored');
  assert.equal(Number((await one(`SELECT used_count FROM coupons WHERE code = 'TENOFF'`)).used_count), used - 1);
  await assert.rejects(startPayment(o.order.id), /not awaiting payment/);

  const amount = Number((await one('SELECT amount_minor FROM payments WHERE reference = $1', [reference])).amount_minor);
  const r = await confirmPayment(reference, { status: 'success', reference, amountMinor: amount, currency: 'NGN', transactionId: '90' });
  assert.equal(r.status, 'paid');
  assert.equal(await stockOf('product_variants', ids.wine), before - 2, 'late payment re-reserved stock');
  const after = await one('SELECT status, needs_attention FROM orders WHERE id = $1', [o.order.id]);
  assert.equal(after.status, 'paid');
  assert.equal(after.needs_attention, false);
});

test('manual shipping quotation flow', { skip }, async () => {
  const o = await placeOrder(order({ address: gbAddress, methodId: ids.gbWeight, items: [{ productId: ids.variantProduct, variantId: ids.wine, quantity: 1, customizations: { note: 'q' } }] }), { settings });
  assert.equal(o.order.status, 'awaiting_quote');
  assert.equal(o.order.total_kobo, null);
  await assert.rejects(startPayment(o.order.id), /not awaiting payment/);
  await setShippingQuote(o.order.id, 3000000, { id: null }, { paymentDays: 3 });
  const q = await one('SELECT status, shipping_kobo, total_kobo, expires_at FROM orders WHERE id = $1', [o.order.id]);
  assert.equal(q.status, 'pending_payment');
  assert.equal(Number(q.total_kobo), 2000000 + 3000000);
  assert.ok(q.expires_at);
  await assert.rejects(setShippingQuote(o.order.id, 1, null), /not waiting/);
});

test('fulfilment transitions and cancellation release stock', { skip }, async () => {
  await assert.rejects(updateOrderStatus(ids.orderA, 'delivered', null), /cannot be moved/);
  await updateOrderStatus(ids.orderA, 'processing', null);
  await updateOrderStatus(ids.orderA, 'shipped', null, { carrier: 'DHL', trackingNumber: 'DHL123' });
  const s = await one('SELECT status, carrier, tracking_number, shipped_at FROM orders WHERE id = $1', [ids.orderA]);
  assert.equal(s.status, 'shipped');
  assert.equal(s.tracking_number, 'DHL123');

  const o = await placeOrder(order(), { settings });
  const before = await stockOf('products', ids.simple);
  await updateOrderStatus(o.order.id, 'cancelled', null, { note: 'Customer request' });
  assert.equal(await stockOf('products', ids.simple), before + 1);
  await updateOrderStatus(o.order.id, 'cancelled', null).catch(() => {});
  assert.equal(await stockOf('products', ids.simple), before + 1, 'release is not repeated');
});

test('refunds: partial, full, and over-refund rejected', { skip }, async () => {
  await assert.rejects(recordRefund(ids.couponOrder, 100, null), /Only paid orders/);
  await recordRefund(ids.orderA, 300000, null, { reason: 'Shipping refund' });
  let o = await one('SELECT status, payment_status, refunded_kobo FROM orders WHERE id = $1', [ids.orderA]);
  assert.equal(o.payment_status, 'partially_refunded');
  assert.equal(Number(o.refunded_kobo), 300000);
  await assert.rejects(recordRefund(ids.orderA, 99999999, null), /most you can refund/);
  await recordRefund(ids.orderA, 3000000, null, { method: 'paystack' });
  o = await one('SELECT status, payment_status FROM orders WHERE id = $1', [ids.orderA]);
  assert.equal(o.status, 'refunded');
  assert.equal(o.payment_status, 'refunded');
});

test('custom order: no charge before an issued quotation; acceptance creates an exact payable order', { skip }, async () => {
  const ownerKey = 'visitor-key-1';
  const mine = await one(`INSERT INTO media_assets (url, pathname, content_type, size_bytes, purpose, owner_key_hash) VALUES ('https://x/1.jpg','1.jpg','image/jpeg',10,'custom_reference',$1) RETURNING id`, [sha256(ownerKey)]);
  const theirs = await one(`INSERT INTO media_assets (url, pathname, content_type, size_bytes, purpose, owner_key_hash) VALUES ('https://x/2.jpg','2.jpg','image/jpeg',10,'custom_reference',$1) RETURNING id`, [sha256('someone-else')]);
  const req = await createRequest(
    { kind: 'custom', name: 'Bola', email: 'bola@example.test', phone: '+2348032242010', product_type: 'Autogele', style_description: 'Gold for wedding', quantity: 3, country_code: 'NG' },
    { mediaIds: { reference: [Number(mine.id), Number(theirs.id)] }, ownerKey }
  );
  const files = await query('SELECT media_id FROM custom_request_files WHERE request_id = $1', [req.id]);
  assert.deepEqual(files.map((f) => Number(f.media_id)), [Number(mine.id)], 'cannot attach another visitor\'s upload');

  await assert.rejects(acceptQuote(req.reference, req.tracking_token), /no open quotation/);
  await assert.rejects(issueQuote(req.id, { quoteKobo: 0 }, null), /valid quotation/);
  await issueQuote(req.id, { quoteKobo: 7500000, notes: 'Includes delivery' }, null);
  await assert.rejects(acceptQuote(req.reference, 'wrong-token'), /not found/);
  const o = await acceptQuote(req.reference, req.tracking_token);
  assert.equal(o.kind, 'custom');
  assert.equal(Number(o.total_kobo), 7500000);
  assert.equal(o.status, 'pending_payment');
  const again = await acceptQuote(req.reference, req.tracking_token);
  assert.equal(again.id, o.id, 'accepting twice returns the same order');
  assert.equal((await one('SELECT status FROM custom_requests WHERE id = $1', [req.id])).status, 'approved');
  assert.equal(await getRequestForCustomer(req.reference, 'nope'), null);
  assert.ok(await getRequestForCustomer(req.reference, req.tracking_token));
});

test('order access control: token, owner, or number + email only', { skip }, async () => {
  const o = await placeOrder(order({ userId: ids.customer }), { settings });
  assert.ok(await getOrderByToken(o.order.order_number, o.order.tracking_token));
  assert.equal(await getOrderByToken(o.order.order_number, 'guess'), null);
  assert.equal(await getOrderByToken(o.order.order_number, ''), null);
  assert.ok(await getOrderForUser(o.order.order_number, ids.customer));
  assert.equal(await getOrderForUser(o.order.order_number, ids.other), null);
  assert.ok(await findOrderForLookup(o.order.order_number.toLowerCase(), 'ADA@example.test'));
  assert.equal(await findOrderForLookup(o.order.order_number, 'someone@else.test'), null);
});

test('catalogue queries: filters, search, pagination, availability, best sellers from paid sales only', { skip }, async () => {
  const all = await listProducts({ perPage: 2 });
  assert.equal(all.total, 3, 'drafts excluded');
  assert.equal(all.items.length, 2);
  assert.equal(all.pages, 2);
  assert.equal((await listProducts({ q: 'velvet' })).items[0].slug, 'velvet-turban');
  assert.equal((await listProducts({ q: "%' OR 1=1 --" })).total, 0, 'search input is data, not SQL');
  const inStock = await listProducts({ inStock: true });
  assert.equal(inStock.items.some((p) => p.slug === 'last-piece'), false);
  assert.equal((await listProducts({ minKobo: 1900000 })).items.every((p) => p.from_price_kobo >= 1900000), true);
  const p = await getProductBySlug('autogele');
  assert.equal(p.variants.length, 2);
  assert.equal(await getProductBySlug('draft'), null);
  const best = await bestSellers();
  assert.ok(best.length >= 1);
});

test('SQL constraints guard money, stock and state', { skip }, async () => {
  await assert.rejects(query(`UPDATE products SET stock = -1 WHERE id = $1`, [ids.simple]), /check/i);
  await assert.rejects(query(`UPDATE products SET compare_at_kobo = 100 WHERE id = $1`, [ids.simple]), /check/i);
  await assert.rejects(query(`INSERT INTO coupons (code, type, value) VALUES ('BADPCT', 'percent', 150)`), /check/i);
  await assert.rejects(query(`INSERT INTO coupons (code, type, value) VALUES ('lower', 'fixed', 1)`), /check/i);
  await assert.rejects(query(`UPDATE orders SET status = 'teleported' WHERE id = $1`, [ids.orderA]), /check/i);
  await assert.rejects(query(`INSERT INTO order_items (order_id, name, sku, unit_price_kobo, quantity, line_total_kobo) VALUES ($1, 'x', 'x', 100, 2, 150)`, [ids.orderA]), /check/i);
  await assert.rejects(query(`INSERT INTO users (email, password_hash, name) VALUES ('CUST@example.test', 'x', 'dup')`), /users_email_lower_key/);
  await assert.rejects(query(`UPDATE users SET role = 'owner' WHERE id = $1`, [ids.customer]), /check/i);
  await assert.rejects(transaction(async (tx) => {
    await tx.query('UPDATE products SET stock = 99 WHERE id = $1', [ids.simple]);
    throw new Error('boom');
  }), /boom/);
  assert.notEqual(await stockOf('products', ids.simple), 99, 'rolled back');
});

test('sessions and password reset', { skip }, async () => {
  const { user: u } = await registerCustomer({ name: 'Reg', email: 'reg@example.test', password: 'Secretpass123' });
  assert.ok(u);
  assert.deepEqual(await registerCustomer({ name: 'Reg', email: 'REG@example.test', password: 'Secretpass123' }), { error: 'email' }, 'duplicate email');
  assert.ok(await authenticate('reg@example.test', 'Secretpass123'));
  assert.equal(await authenticate('reg@example.test', 'wrongpass123'), null);
  assert.equal(await authenticate('nobody@example.test', 'Secretpass123'), null);
  const { token } = await createSession(u);
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM sessions WHERE token_hash = $1', [token])).n, 0, 'raw token never stored');
  assert.equal((await getSessionUser(token)).email, 'reg@example.test');
  const reset = await createPasswordResetToken(u.id);
  assert.equal(await resetPasswordWithToken(reset, 'Newsecret456'), true);
  assert.equal(await resetPasswordWithToken(reset, 'Another789xyz'), false, 'single use');
  assert.equal(await getSessionUser(token), null, 'sessions revoked after reset');
  assert.ok(await authenticate('reg@example.test', 'Newsecret456'));
  const s2 = await createSession(u);
  await destroySession(s2.token);
  assert.equal(await getSessionUser(s2.token), null);
  await query('UPDATE users SET is_active = FALSE WHERE id = $1', [u.id]);
  assert.equal(await authenticate('reg@example.test', 'Newsecret456'), null, 'deactivated');
});

test('rate limiting is shared through the database', { skip }, async () => {
  let last;
  for (let i = 0; i < 9; i++) last = await rateLimit('login', '203.0.113.9');
  assert.equal(last.ok, false);
  assert.ok(last.retryAfterSeconds > 0);
  assert.equal((await rateLimit('login', '203.0.113.10')).ok, true, 'other clients unaffected');
});

test('sign in with email or phone; one phone per account', { skip }, async () => {
  const { user } = await registerCustomer({ name: 'Phone User', email: 'phone@example.test', phone: '+2348031112222', password: 'Phonepass123' });
  assert.ok(user);
  assert.deepEqual(await registerCustomer({ name: 'Copy', email: 'copy@example.test', phone: '+2348031112222', password: 'Phonepass123' }), { error: 'phone' });
  assert.equal((await authenticate('0803 111 2222', 'Phonepass123'))?.email, 'phone@example.test', 'national format');
  assert.equal((await authenticate('+234 803 111 2222', 'Phonepass123'))?.email, 'phone@example.test', 'international format');
  assert.equal((await authenticate('PHONE@example.test', 'Phonepass123'))?.email, 'phone@example.test');
  assert.equal(await authenticate('08031112222', 'wrongpass123'), null);
  assert.equal(await authenticate('0803111', 'Phonepass123'), null, 'invalid phone');
  assert.equal(await authenticate('', 'Phonepass123'), null);
});

test('social sign-in: create, sign back in, verified-email linking rules, staff protected', { skip }, async () => {
  const g = { providerUserId: 'g-123', email: 'New.Social@example.test', emailVerified: true, name: 'New Social' };
  const first = await resolveSocialLogin('google', g);
  assert.equal(first.created, true);
  assert.equal(first.user.email, 'new.social@example.test');
  assert.equal((await one('SELECT password_hash FROM users WHERE id = $1', [first.user.id])).password_hash, null, 'no password yet');
  const again = await resolveSocialLogin('google', { ...g, email: 'changed@example.test' });
  assert.equal(again.created, false);
  assert.equal(again.user.id, first.user.id, 'identity keyed on provider id, not email');
  assert.equal(await authenticate('new.social@example.test', ''), null, 'no password sign-in for social-only account');

  assert.deepEqual(await resolveSocialLogin('google', { providerUserId: 'g-x', email: 'x@example.test', emailVerified: false }), { error: 'unverified' });
  assert.deepEqual(await resolveSocialLogin('facebook', { providerUserId: 'f-1', email: null }), { error: 'no_email' });

  // Existing password account with the same email
  await registerCustomer({ name: 'Existing', email: 'existing@example.test', password: 'Existing123x' });
  const fb = await resolveSocialLogin('facebook', { providerUserId: 'f-2', email: 'existing@example.test', emailVerified: false });
  assert.equal(fb.error, 'exists', 'Facebook never auto-links');
  const gl = await resolveSocialLogin('google', { providerUserId: 'g-2', email: 'EXISTING@example.test', emailVerified: true });
  assert.equal(gl.user.email, 'existing@example.test', 'verified Google email links to the existing account');
  assert.ok(await authenticate('existing@example.test', 'Existing123x'), 'password still works');

  // Staff are never linked automatically
  await query(`INSERT INTO users (email, password_hash, name, role) VALUES ('boss@example.test', 'x', 'Boss', 'admin')`);
  assert.equal((await resolveSocialLogin('google', { providerUserId: 'g-3', email: 'boss@example.test', emailVerified: true })).error, 'staff');

  // Deactivated
  await query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [first.user.id]);
  assert.deepEqual(await resolveSocialLogin('google', g), { error: 'deactivated' });
  await query(`UPDATE users SET is_active = TRUE WHERE id = $1`, [first.user.id]);
});

test('connect, disconnect and first password for social accounts', { skip }, async () => {
  const owner = (await resolveSocialLogin('google', { providerUserId: 'g-link', email: 'link@example.test', emailVerified: true, name: 'Link' })).user;
  assert.equal(await unlinkIdentity(owner.id, 'google'), 'last_method', 'cannot remove the only way in');
  assert.equal(await linkIdentity(owner.id, 'facebook', { providerUserId: 'f-link', email: 'other@example.test' }), 'linked');
  assert.equal(await linkIdentity(owner.id, 'facebook', { providerUserId: 'f-link' }), 'already');
  const someone = (await registerCustomer({ name: 'S', email: 'someone@example.test', password: 'Someone1234' })).user;
  assert.equal(await linkIdentity(someone.id, 'facebook', { providerUserId: 'f-link' }), 'taken', 'one Facebook account per store account');
  assert.equal(await unlinkIdentity(owner.id, 'google'), 'unlinked', 'Facebook remains');
  assert.equal(await unlinkIdentity(owner.id, 'facebook'), 'last_method');
  assert.equal(await changePassword(owner.id, '', 'Firstpass123'), 'set', 'first password needs no current password');
  assert.ok(await authenticate('link@example.test', 'Firstpass123'));
  assert.equal(await changePassword(owner.id, 'wrong', 'Another1234'), false, 'later changes need the current password');
  assert.equal(await unlinkIdentity(owner.id, 'facebook'), 'unlinked', 'password now exists');
  const m = await signInMethods(owner.id);
  assert.equal(m.hasPassword, true);
  assert.equal(m.identities.length, 0);
});
