// Checkout, stock reservation and payment confirmation.
//
// Invariants:
//  - Browser input (cart contents, prices, totals) is never trusted. Everything is re-priced here.
//  - Stock is reserved with conditional UPDATEs (`... WHERE stock >= qty`) inside the order
//    transaction, so two buyers can never take the last piece.
//  - An order becomes `paid` only inside confirmPayment(), after the provider's server-side
//    verification matches reference, amount and currency. A browser redirect is not proof.
//  - confirmPayment() is idempotent: callbacks, webhooks and retries can all call it safely.
import { isUniqueViolation, json, one, query, transaction } from './db.js';
import {
  comparePriceKobo, computeTotals, evaluateCoupon, lineTotalKobo, MAX_LINE_QUANTITY,
  unitPriceKobo, validateCustomizations, variantLabel,
} from './pricing.js';
import { loadShippingConfig, shippingOptionsFor } from './shipping.js';
import { paymentProvider } from './payments/index.js';
import { appUrl, orderNumber, randomToken, shortCode } from './utilities.js';
import { chargeAmountUsdCents, isSnapshotFresh } from './currency.js';

export const ORDER_STATUS_LABELS = {
  awaiting_quote: 'Awaiting shipping quote',
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  processing: 'Being prepared',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  expired: 'Expired — not paid',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
};

export class CheckoutError extends Error {
  constructor(message, code = 'checkout', details = null) {
    super(message);
    this.code = code;
    this.details = details;
    this.userMessage = message;
  }
}

const MAX_LINES = 30;

export function sanitizeCartItems(raw) {
  if (!Array.isArray(raw)) return [];
  const merged = new Map();
  for (const it of raw.slice(0, MAX_LINES)) {
    const productId = Number(it?.productId);
    if (!Number.isSafeInteger(productId) || productId <= 0) continue;
    const variantId = it?.variantId === null || it?.variantId === undefined || it?.variantId === '' ? null : Number(it.variantId);
    if (variantId !== null && (!Number.isSafeInteger(variantId) || variantId <= 0)) continue;
    const quantity = Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.floor(Number(it?.quantity) || 1)));
    const customizations = {};
    if (it?.customizations && typeof it.customizations === 'object' && !Array.isArray(it.customizations)) {
      for (const [k, v] of Object.entries(it.customizations).slice(0, 10)) {
        if (typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(k) && v.trim()) customizations[k] = v.trim().slice(0, 500);
      }
    }
    const key = `${productId}:${variantId ?? ''}:${JSON.stringify(Object.entries(customizations).sort())}`;
    const prev = merged.get(key);
    if (prev) prev.quantity = Math.min(MAX_LINE_QUANTITY, prev.quantity + quantity);
    else merged.set(key, { key, productId, variantId, quantity, customizations });
  }
  return [...merged.values()];
}

/** Server-side pricing of cart items. `db` may be a transaction executor. */
export async function priceCart(rawItems, db = { query }) {
  const items = sanitizeCartItems(rawItems);
  const empty = { lines: [], issues: [], subtotalKobo: 0, weightGrams: 0, itemCount: 0 };
  if (!items.length) return empty;

  const productIds = [...new Set(items.map((i) => i.productId))];
  const variantIds = [...new Set(items.map((i) => i.variantId).filter(Boolean))];
  const products = await db.query(
    `SELECT p.id, p.name, p.slug, p.sku, p.price_kobo, p.compare_at_kobo, p.stock, p.track_inventory, p.status,
            p.weight_grams, p.customization_options, p.category_id,
            (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image_url,
            EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active) AS has_variants
       FROM products p WHERE p.id = ANY($1::bigint[])`,
    [productIds]
  );
  const variants = variantIds.length
    ? await db.query(
        `SELECT id, product_id, sku, option_values, price_kobo, compare_at_kobo, stock, is_active
           FROM product_variants WHERE id = ANY($1::bigint[])`,
        [variantIds]
      )
    : [];
  const pMap = new Map(products.map((p) => [Number(p.id), p]));
  const vMap = new Map(variants.map((v) => [Number(v.id), v]));

  const lines = [];
  const issues = [];
  let subtotal = 0;
  let weight = 0;
  let weightKnown = true;
  let count = 0;

  for (const it of items) {
    const p = pMap.get(it.productId);
    if (!p || p.status !== 'published') {
      issues.push({ key: it.key, type: 'unavailable', message: 'This item is no longer available.' });
      continue;
    }
    let v = null;
    if (p.has_variants) {
      v = it.variantId ? vMap.get(it.variantId) : null;
      if (!v || Number(v.product_id) !== Number(p.id) || !v.is_active) {
        issues.push({ key: it.key, type: 'variant_required', message: `Choose an available option for ${p.name}.` });
        continue;
      }
    } else if (it.variantId) {
      issues.push({ key: it.key, type: 'unavailable', message: 'This option is no longer available.' });
      continue;
    }

    const custom = validateCustomizations(p.customization_options, it.customizations);
    const unit = unitPriceKobo(p, v);
    const available = p.track_inventory ? Number(v ? v.stock : p.stock) : null;
    const line = {
      key: it.key,
      productId: Number(p.id),
      variantId: v ? Number(v.id) : null,
      name: p.name,
      slug: p.slug,
      sku: v ? v.sku : p.sku,
      variantLabel: v ? variantLabel(v.option_values) : null,
      imageUrl: p.image_url,
      unitPriceKobo: unit,
      compareAtKobo: comparePriceKobo(p, v),
      quantity: it.quantity,
      lineTotalKobo: lineTotalKobo(unit, it.quantity),
      available,
      trackInventory: Boolean(p.track_inventory),
      customizations: custom.values,
      weightGrams: p.weight_grams === null ? null : Number(p.weight_grams),
      categoryId: p.category_id,
    };
    if (custom.errors.length) issues.push({ key: it.key, type: 'customization', message: custom.errors.join(' ') });
    if (available !== null && it.quantity > available) {
      issues.push({
        key: it.key,
        type: 'insufficient_stock',
        available,
        message: available > 0 ? `Only ${available} left of ${p.name}.` : `${p.name} is sold out.`,
      });
    }
    lines.push(line);
    subtotal += line.lineTotalKobo;
    count += line.quantity;
    if (line.weightGrams === null) weightKnown = false;
    else weight += line.weightGrams * line.quantity;
  }
  return { lines, issues, subtotalKobo: subtotal, weightGrams: weightKnown ? weight : null, itemCount: count };
}

export async function findCoupon(code, db = { query }) {
  const c = String(code || '').trim().toUpperCase();
  if (!c || !/^[A-Z0-9_-]{3,32}$/.test(c)) return null;
  const rows = await db.query('SELECT * FROM coupons WHERE code = $1', [c]);
  return rows[0] || null;
}

/**
 * Full server-side quote: lines, shipping options for the destination, coupon, totals.
 */
export async function quoteCheckout({ items, countryCode, methodId, couponCode, email }, { db = { query }, shippingConfig } = {}) {
  const priced = await priceCart(items, db);
  const shipping = countryCode
    ? await shippingOptionsFor(countryCode, { subtotalKobo: priced.subtotalKobo, weightGrams: priced.weightGrams }, shippingConfig)
    : { status: 'missing_country', zone: null, options: [] };
  const selected = shipping.options.find((o) => String(o.id) === String(methodId)) || null;
  const shippingKobo = selected && !selected.requiresQuote ? selected.rateKobo : null;

  let coupon = null;
  let discount = { discountKobo: 0, shippingDiscountKobo: 0 };
  if (couponCode && String(couponCode).trim()) {
    const c = await findCoupon(couponCode, db);
    let prior = 0;
    if (c && email) {
      const r = await db.query(
        `SELECT COUNT(*)::int AS n FROM coupon_redemptions WHERE coupon_id = $1 AND LOWER(email) = LOWER($2) AND NOT released`,
        [c.id, email]
      );
      prior = Number(r[0]?.n || 0);
    }
    const ev = evaluateCoupon(c, { subtotalKobo: priced.subtotalKobo, shippingKobo, email, priorUsesByEmail: prior });
    coupon = { code: String(couponCode).trim().toUpperCase(), ok: ev.ok, reason: ev.reason || null, id: c?.id ?? null, type: c?.type ?? null };
    if (ev.ok) discount = ev;
  }

  const totals = computeTotals({ subtotalKobo: priced.subtotalKobo, ...discount, shippingKobo });
  return {
    ...priced,
    shipping: { ...shipping, selected },
    coupon,
    totals,
    requiresQuote: Boolean(selected?.requiresQuote),
  };
}

async function reserveStock(tx, line, orderId) {
  if (!line.trackInventory) return false;
  const row = line.variantId
    ? await tx.one(
        'UPDATE product_variants SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING stock',
        [line.quantity, line.variantId]
      )
    : await tx.one('UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING stock', [
        line.quantity,
        line.productId,
      ]);
  if (!row) {
    throw new CheckoutError(`${line.name} has just sold out or has fewer pieces left than you requested.`, 'stock');
  }
  await tx.query(
    `INSERT INTO inventory_movements (product_id, variant_id, change, reason, order_id) VALUES ($1, $2, $3, 'order_reserved', $4)`,
    [line.productId, line.variantId, -line.quantity, orderId]
  );
  return true;
}

/** Return reserved stock for an order (expiry/cancellation). Safe to call twice. */
export async function releaseStock(tx, orderId, actorId = null) {
  const items = await tx.query(
    'SELECT id, product_id, variant_id, quantity FROM order_items WHERE order_id = $1 AND stock_reserved FOR UPDATE',
    [orderId]
  );
  for (const it of items) {
    if (it.variant_id) await tx.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [it.quantity, it.variant_id]);
    else if (it.product_id) await tx.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [it.quantity, it.product_id]);
    await tx.query(
      `INSERT INTO inventory_movements (product_id, variant_id, change, reason, order_id, actor_id) VALUES ($1, $2, $3, 'order_released', $4, $5)`,
      [it.product_id, it.variant_id, it.quantity, orderId, actorId]
    );
    await tx.query('UPDATE order_items SET stock_reserved = FALSE WHERE id = $1', [it.id]);
  }
  return items.length;
}

export async function releaseCoupon(tx, orderId) {
  const r = await tx.one(
    'UPDATE coupon_redemptions SET released = TRUE WHERE order_id = $1 AND NOT released RETURNING coupon_id',
    [orderId]
  );
  if (r) await tx.query('UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1', [r.coupon_id]);
}

/** Try to take stock again for an order whose reservation was released (late payment). */
async function reReserve(tx, orderId) {
  const items = await tx.query(
    `SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity, COALESCE(p.track_inventory, FALSE) AS track
       FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1 AND NOT oi.stock_reserved`,
    [orderId]
  );
  for (const it of items) {
    if (!it.track || !it.product_id) continue;
    const row = it.variant_id
      ? await tx.one('UPDATE product_variants SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING id', [it.quantity, it.variant_id])
      : await tx.one('UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING id', [it.quantity, it.product_id]);
    if (!row) return false; // caller's transaction state is rolled back by the savepoint
    await tx.query('UPDATE order_items SET stock_reserved = TRUE WHERE id = $1', [it.id]);
    await tx.query(
      `INSERT INTO inventory_movements (product_id, variant_id, change, reason, order_id, note) VALUES ($1, $2, $3, 'order_reserved', $4, 'late payment')`,
      [it.product_id, it.variant_id, -it.quantity, orderId]
    );
  }
  return true;
}

function validIdempotencyKey(k) {
  return typeof k === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(k) ? k : null;
}

/**
 * Create an order from untrusted checkout input.
 * input: { items, email, name, phone, address, methodId, couponCode, deliveryInstructions,
 *          displayCurrency, displayFx, chargeCurrency, idempotencyKey, userId }
 * ctx:   { settings, fxSnapshot }
 */
export async function placeOrder(input, { settings, fxSnapshot = null }) {
  const idem = validIdempotencyKey(input.idempotencyKey);
  if (idem) {
    const existing = await one('SELECT * FROM orders WHERE idempotency_key = $1', [idem]);
    if (existing) return { order: existing, duplicate: true };
  }
  await releaseExpiredOrders().catch((e) => console.warn('expiry sweep failed', e?.message));
  const shippingConfig = await loadShippingConfig();
  const windowMinutes = Math.max(15, Number(settings?.payments?.payment_window_minutes) || 60);

  const attempt = () =>
    transaction(async (tx) => {
      const quote = await quoteCheckout(
        { items: input.items, countryCode: input.address.country_code, methodId: input.methodId, couponCode: input.couponCode, email: input.email },
        { db: tx, shippingConfig }
      );
      if (!quote.lines.length) throw new CheckoutError('Your bag is empty.', 'empty');
      if (quote.issues.length) throw new CheckoutError('Some items in your bag need attention.', 'cart_issues', quote.issues);
      if (quote.shipping.status === 'blocked' || quote.shipping.status === 'unavailable') {
        throw new CheckoutError('We are not able to deliver to this destination at the moment.', 'shipping_unavailable');
      }
      const method = quote.shipping.selected;
      if (!method) throw new CheckoutError('Choose a delivery method.', 'shipping_method');
      if (input.couponCode && !quote.coupon?.ok) throw new CheckoutError(quote.coupon?.reason || 'This code is not valid.', 'coupon');

      const requiresQuote = method.requiresQuote;
      const status = requiresQuote ? 'awaiting_quote' : 'pending_payment';
      const t = quote.totals;
      if (!requiresQuote && !(t.totalKobo > 0)) throw new CheckoutError('The order total must be greater than zero.', 'total');

      let chargeCurrency = 'NGN';
      let chargeAmount = requiresQuote ? null : t.totalKobo;
      let chargeFx = null;
      if (input.chargeCurrency === 'USD') {
        const rate = Number(fxSnapshot?.rates?.USD);
        if (!settings?.payments?.usd_enabled || !isSnapshotFresh(fxSnapshot) || !(rate > 0)) {
          throw new CheckoutError('Paying in USD is not available right now. Please pay in NGN.', 'currency');
        }
        chargeCurrency = 'USD';
        chargeFx = { rate, source: fxSnapshot.source, as_of: fxSnapshot.source_updated_at || fxSnapshot.fetched_at };
        chargeAmount = requiresQuote ? null : chargeAmountUsdCents(t.totalKobo, rate);
      }

      const methodSnapshot = {
        id: method.id, name: method.name, type: method.type, carrier: method.carrier,
        estimate: method.estimate, rate_kobo: method.rateKobo, requires_quote: requiresQuote,
        zone: quote.shipping.zone?.name || null,
      };
      const order = await tx.one(
        `INSERT INTO orders (order_number, user_id, email, phone, customer_name, status, subtotal_kobo, discount_kobo,
                             shipping_kobo, total_kobo, charge_currency, charge_amount_minor, charge_fx, display_currency,
                             display_fx, coupon_id, coupon_code, shipping_address, shipping_method, delivery_instructions,
                             tracking_token, idempotency_key, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING *`,
        [
          orderNumber(), input.userId || null, input.email, input.phone, input.name, status,
          t.subtotalKobo, t.discountKobo, t.shippingKobo, t.totalKobo, chargeCurrency, chargeAmount, json(chargeFx),
          input.displayCurrency || 'NGN', json(input.displayFx || null),
          quote.coupon?.ok ? quote.coupon.id : null, quote.coupon?.ok ? quote.coupon.code : null,
          json(input.address), json(methodSnapshot), input.deliveryInstructions || null,
          randomToken(24), idem,
          requiresQuote ? null : new Date(Date.now() + windowMinutes * 60000).toISOString(),
        ]
      );

      for (const line of quote.lines) {
        const reserved = await reserveStock(tx, line, order.id);
        await tx.query(
          `INSERT INTO order_items (order_id, product_id, variant_id, name, sku, variant_label, customizations,
                                    unit_price_kobo, quantity, line_total_kobo, image_url, weight_grams, stock_reserved)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            order.id, line.productId, line.variantId, line.name, line.sku, line.variantLabel, json(line.customizations),
            line.unitPriceKobo, line.quantity, line.lineTotalKobo, line.imageUrl, line.weightGrams, reserved,
          ]
        );
      }

      if (quote.coupon?.ok) {
        const taken = await tx.one(
          `UPDATE coupons SET used_count = used_count + 1
            WHERE id = $1 AND is_active AND (usage_limit IS NULL OR used_count < usage_limit) RETURNING id`,
          [quote.coupon.id]
        );
        if (!taken) throw new CheckoutError('This code has reached its usage limit.', 'coupon');
        await tx.query('INSERT INTO coupon_redemptions (coupon_id, order_id, email) VALUES ($1, $2, $3)', [
          quote.coupon.id, order.id, input.email,
        ]);
      }

      await tx.query('INSERT INTO order_events (order_id, status, note) VALUES ($1, $2, $3)', [
        order.id,
        status,
        requiresQuote ? 'Order received. Delivery needs a shipping quotation; nothing has been charged.' : 'Order placed. Awaiting payment.',
      ]);
      return { order, items: quote.lines };
    });

  for (let i = 0; i < 3; i++) {
    try {
      const r = await attempt();
      return { ...r, duplicate: false };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      if (idem && /idempotency/.test(err.message)) {
        const existing = await one('SELECT * FROM orders WHERE idempotency_key = $1', [idem]);
        if (existing) return { order: existing, duplicate: true };
      }
      if (!/order_number/.test(err.message)) throw err; // retry only on order-number collision
    }
  }
  throw new CheckoutError('We could not create your order. Please try again.', 'retry');
}

/** Start (or resume) a provider payment for a pending order. Returns { authorizationUrl, reference }. */
export async function startPayment(orderId) {
  const provider = paymentProvider();
  if (!provider.isConfigured()) {
    throw new CheckoutError('Online payment is not available at the moment. Please contact us to complete your order.', 'payments_unconfigured');
  }
  const order = await one('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!order || order.status !== 'pending_payment') throw new CheckoutError('This order is not awaiting payment.', 'state');
  if (order.expires_at && new Date(order.expires_at) <= new Date()) {
    throw new CheckoutError('The payment window for this order has closed. Please place a new order.', 'expired');
  }
  const amount = Number(order.charge_amount_minor ?? order.total_kobo);
  const currency = order.charge_currency;

  const existing = await one(
    `SELECT reference, authorization_url FROM payments
      WHERE order_id = $1 AND status = 'initialized' AND authorization_url IS NOT NULL
        AND amount_minor = $2 AND currency = $3 AND created_at > NOW() - INTERVAL '20 minutes'
      ORDER BY created_at DESC LIMIT 1`,
    [order.id, amount, currency]
  );
  if (existing) return { authorizationUrl: existing.authorization_url, reference: existing.reference };

  const reference = `${order.order_number}-${shortCode(6)}`;
  await query(
    'INSERT INTO payments (order_id, provider, reference, amount_minor, currency) VALUES ($1, $2, $3, $4, $5)',
    [order.id, provider.name || 'paystack', reference, amount, currency]
  );
  try {
    const init = await provider.initialize({
      email: order.email,
      amountMinor: amount,
      currency,
      reference,
      callbackUrl: appUrl('/checkout/verify'),
      metadata: { order_number: order.order_number, order_id: order.id },
    });
    await query('UPDATE payments SET authorization_url = $1 WHERE reference = $2', [init.authorizationUrl, reference]);
    return { authorizationUrl: init.authorizationUrl, reference };
  } catch (err) {
    await query(`UPDATE payments SET status = 'failed', gateway_response = $2 WHERE reference = $1`, [
      reference,
      String(err?.message || 'init failed').slice(0, 200),
    ]);
    throw new CheckoutError('We could not start the payment. Please try again in a moment.', 'payment_init');
  }
}

/**
 * Apply a provider verification result. Idempotent.
 * Returns { status: 'paid'|'already_paid'|'pending'|'failed'|'mismatch'|'unknown', orderId, newlyPaid }.
 */
export async function confirmPayment(reference, verified) {
  return transaction(async (tx) => {
    const payment = await tx.one('SELECT * FROM payments WHERE reference = $1 FOR UPDATE', [reference]);
    if (!payment) return { status: 'unknown', orderId: null, newlyPaid: false };
    const orderId = Number(payment.order_id);
    if (payment.status === 'success') return { status: 'already_paid', orderId, newlyPaid: false };

    const order = await tx.one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);

    if (verified?.status !== 'success') {
      if (['failed', 'abandoned', 'reversed'].includes(verified?.status) && payment.status === 'initialized') {
        await tx.query(`UPDATE payments SET status = $2, gateway_response = $3, verified_at = NOW() WHERE id = $1`, [
          payment.id, verified.status === 'abandoned' ? 'abandoned' : 'failed', verified.gatewayResponse,
        ]);
        await tx.query(
          `INSERT INTO order_events (order_id, status, note, visible_to_customer) VALUES ($1, NULL, $2, TRUE)`,
          [orderId, 'A payment attempt was not completed.']
        );
        return { status: 'failed', orderId, newlyPaid: false };
      }
      return { status: verified?.status === 'failed' ? 'failed' : 'pending', orderId, newlyPaid: false };
    }

    const mismatch =
      verified.reference !== payment.reference ||
      Number(verified.amountMinor) !== Number(payment.amount_minor) ||
      String(verified.currency).toUpperCase() !== String(payment.currency).toUpperCase();
    if (mismatch) {
      await tx.query(`UPDATE payments SET status = 'mismatch', gateway_response = $2, verified_at = NOW() WHERE id = $1`, [
        payment.id,
        `Verification mismatch: got ${verified.amountMinor} ${verified.currency} for ${verified.reference}`,
      ]);
      await tx.query(`UPDATE orders SET needs_attention = TRUE, attention_note = $2 WHERE id = $1`, [
        orderId, 'Payment verification did not match the order amount or currency. Do not fulfil until reviewed.',
      ]);
      return { status: 'mismatch', orderId, newlyPaid: false };
    }

    if (order.payment_status === 'paid' || ['paid', 'processing', 'shipped', 'delivered'].includes(order.status)) {
      // A second successful charge for an order that is already paid: record and flag for refund.
      await tx.query(
        `UPDATE payments SET status = 'mismatch', gateway_response = $2, verified_at = NOW(), provider_transaction_id = $3 WHERE id = $1`,
        [payment.id, 'Duplicate successful payment for an already-paid order. Refund required.', verified.transactionId]
      );
      await tx.query(`UPDATE orders SET needs_attention = TRUE, attention_note = $2 WHERE id = $1`, [
        orderId, `Duplicate payment ${payment.reference} received — refund it in Paystack.`,
      ]);
      return { status: 'mismatch', orderId, newlyPaid: false };
    }

    await tx.query(
      `UPDATE payments SET status = 'success', verified_at = NOW(), paid_at = COALESCE($2::timestamptz, NOW()),
              provider_transaction_id = $3, channel = $4, gateway_response = $5 WHERE id = $1`,
      [payment.id, verified.paidAt, verified.transactionId, verified.channel, verified.gatewayResponse]
    );

    let note = 'Payment verified.';
    let attention = null;
    if (order.status === 'expired' || order.status === 'cancelled') {
      await tx.query('SAVEPOINT rereserve');
      const ok = await reReserve(tx, orderId);
      if (ok) {
        await tx.query('RELEASE SAVEPOINT rereserve');
        note = 'Payment verified after the reservation had lapsed; items were reserved again.';
        const red = await tx.one('UPDATE coupon_redemptions SET released = FALSE WHERE order_id = $1 AND released RETURNING coupon_id', [orderId]);
        if (red) await tx.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1 AND (usage_limit IS NULL OR used_count < usage_limit)', [red.coupon_id]);
      } else {
        await tx.query('ROLLBACK TO SAVEPOINT rereserve');
        note = 'Payment verified after the reservation had lapsed.';
        attention = 'Paid after the order expired and some items are no longer in stock. Restock or refund.';
      }
    } else if (order.status !== 'pending_payment') {
      attention = `Payment verified while order was "${order.status}". Review before fulfilling.`;
    }

    await tx.query(
      `UPDATE orders SET status = 'paid', payment_status = 'paid', paid_at = NOW(), expires_at = NULL, cancelled_at = NULL,
              needs_attention = (needs_attention OR $2), attention_note = COALESCE($3, attention_note)
        WHERE id = $1`,
      [orderId, Boolean(attention), attention]
    );
    await tx.query('INSERT INTO order_events (order_id, status, note) VALUES ($1, $2, $3)', [orderId, 'paid', note]);
    if (order.custom_request_id) {
      await tx.query(
        `INSERT INTO custom_request_events (request_id, status, note) VALUES ($1, NULL, $2)`,
        [order.custom_request_id, `Payment received for order ${order.order_number}.`]
      );
    }
    return { status: 'paid', orderId, newlyPaid: true };
  });
}

/** Ask the provider, then confirm. Used by the callback page and the webhook. */
export async function verifyAndConfirm(reference) {
  if (!/^[A-Za-z0-9.=-]{6,100}$/.test(String(reference || ''))) return { status: 'unknown', orderId: null, newlyPaid: false };
  const known = await one('SELECT id FROM payments WHERE reference = $1', [reference]);
  if (!known) return { status: 'unknown', orderId: null, newlyPaid: false };
  const verified = await paymentProvider().verify(reference);
  return confirmPayment(reference, verified);
}

/**
 * Process a provider webhook delivery. Returns { httpStatus, result }.
 * The raw body must be passed exactly as received for signature verification.
 */
export async function handleProviderWebhook(rawBody, signature) {
  const provider = paymentProvider();
  if (!provider.verifySignature(rawBody, signature)) return { httpStatus: 401, result: 'bad_signature' };
  let event;
  try { event = JSON.parse(rawBody); } catch { return { httpStatus: 400, result: 'bad_json' }; }
  const data = event?.data || {};
  const dedupeKey = `${event?.event}:${data.id ?? ''}:${data.reference ?? ''}`;
  await query(
    `INSERT INTO payment_events (provider, dedupe_key, event_type, reference, payload) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider, dedupe_key) DO NOTHING`,
    [provider.name || 'paystack', dedupeKey, String(event?.event || 'unknown'), data.reference || null, json(provider.sanitizeEvent(event))]
  );
  const ev = await one('SELECT id, processed_at FROM payment_events WHERE provider = $1 AND dedupe_key = $2', [
    provider.name || 'paystack', dedupeKey,
  ]);
  if (ev?.processed_at) return { httpStatus: 200, result: 'duplicate' };

  let result = 'ignored';
  if (event.event === 'charge.success' && data.reference) {
    const r = await verifyAndConfirm(data.reference); // re-verify with the API; never trust the payload alone
    result = r.status;
    if (r.newlyPaid) {
      const { notifyPaymentConfirmed } = await import('./notifications.js');
      await notifyPaymentConfirmed(r.orderId);
    }
  }
  await query('UPDATE payment_events SET processed_at = NOW(), result = $2 WHERE id = $1', [ev.id, result]);
  return { httpStatus: 200, result };
}

/** Expire unpaid orders past their window and release their stock and coupon. */
export async function releaseExpiredOrders(limit = 50) {
  return transaction(async (tx) => {
    const rows = await tx.query(
      `SELECT id FROM orders WHERE status = 'pending_payment' AND expires_at < NOW()
        ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    for (const r of rows) {
      await releaseStock(tx, r.id);
      await releaseCoupon(tx, r.id);
      await tx.query(`UPDATE orders SET status = 'expired', expires_at = NULL WHERE id = $1`, [r.id]);
      await tx.query('INSERT INTO order_events (order_id, status, note) VALUES ($1, $2, $3)', [
        r.id, 'expired', 'Payment was not completed in time; the items were released.',
      ]);
    }
    return rows.length;
  });
}

export function orderTrackUrl(order) {
  return appUrl(`/track/${encodeURIComponent(order.order_number)}?token=${encodeURIComponent(order.tracking_token)}`);
}
