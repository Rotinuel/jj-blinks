// Staff-side order operations. Callers must check permissions first (lib/auth.js).
// "paid" can never be set here — only a verified payment (lib/orders.js) does that.
import { json, one, transaction } from './db.js';
import { CheckoutError, releaseCoupon, releaseStock } from './orders.js';
import { paymentProvider } from './payments/index.js';
import { chargeAmountUsdCents } from './currency.js';

/** Fulfilment transitions staff may make. */
export const ADMIN_TRANSITIONS = {
  awaiting_quote: ['cancelled'],
  pending_payment: ['cancelled'],
  paid: ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  partially_refunded: ['processing', 'shipped', 'delivered'],
  delivered: [],
  cancelled: [],
  expired: [],
  refunded: [],
};

export function canTransition(from, to) {
  return (ADMIN_TRANSITIONS[from] || []).includes(to);
}

export async function updateOrderStatus(orderId, to, actor, { note = '', carrier, trackingNumber, trackingUrl, notifyCustomer = true } = {}) {
  return transaction(async (tx) => {
    const order = await tx.one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!order) throw new CheckoutError('Order not found.', 'not_found');
    if (!canTransition(order.status, to)) {
      throw new CheckoutError(`An order that is "${order.status}" cannot be moved to "${to}".`, 'transition');
    }
    if (to === 'shipped' && !trackingNumber && !order.tracking_number && !note) {
      // allowed, but encourage a tracking number or note for the customer
    }
    if (to === 'cancelled') {
      if (!['shipped', 'delivered'].includes(order.status)) await releaseStock(tx, orderId, actor?.id);
      if (order.payment_status !== 'paid') await releaseCoupon(tx, orderId);
    }
    await tx.query(
      `UPDATE orders SET status = $2,
              carrier = COALESCE($3, carrier), tracking_number = COALESCE($4, tracking_number), tracking_url = COALESCE($5, tracking_url),
              shipped_at = CASE WHEN $2 = 'shipped' THEN NOW() ELSE shipped_at END,
              delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END,
              cancelled_at = CASE WHEN $2 = 'cancelled' THEN NOW() ELSE cancelled_at END,
              expires_at = CASE WHEN $2 = 'cancelled' THEN NULL ELSE expires_at END,
              needs_attention = CASE WHEN $2 = 'cancelled' AND payment_status = 'paid' THEN TRUE ELSE needs_attention END,
              attention_note = CASE WHEN $2 = 'cancelled' AND payment_status = 'paid' THEN 'Cancelled after payment — issue a refund.' ELSE attention_note END
        WHERE id = $1`,
      [orderId, to, carrier || null, trackingNumber || null, trackingUrl || null]
    );
    await tx.query('INSERT INTO order_events (order_id, status, note, actor_id) VALUES ($1, $2, $3, $4)', [
      orderId, to, note || null, actor?.id ?? null,
    ]);
    return { orderId, from: order.status, to, notifyCustomer };
  });
}

/** Set the shipping fee for an order that was waiting for a manual quotation. */
export async function setShippingQuote(orderId, shippingKobo, actor, { fxSnapshot = null, paymentDays = 3, note = '' } = {}) {
  if (!Number.isSafeInteger(shippingKobo) || shippingKobo < 0) throw new CheckoutError('Enter a valid shipping amount.', 'amount');
  return transaction(async (tx) => {
    const order = await tx.one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!order) throw new CheckoutError('Order not found.', 'not_found');
    if (order.status !== 'awaiting_quote') throw new CheckoutError('This order is not waiting for a shipping quote.', 'state');

    let shippingDiscount = 0;
    if (order.coupon_id) {
      const c = await tx.one('SELECT type FROM coupons WHERE id = $1', [order.coupon_id]);
      if (c?.type === 'free_shipping') shippingDiscount = shippingKobo;
    }
    const discount = Number(order.discount_kobo) + shippingDiscount;
    const total = Number(order.subtotal_kobo) - Number(order.discount_kobo) + shippingKobo - shippingDiscount;
    if (!(total > 0)) throw new CheckoutError('The order total must be greater than zero.', 'total');

    let chargeAmount = total;
    let chargeFx = order.charge_fx;
    if (order.charge_currency === 'USD') {
      const rate = Number(fxSnapshot?.rates?.USD);
      if (!(rate > 0)) throw new CheckoutError('A current USD rate is needed to quote this USD order.', 'fx');
      chargeAmount = chargeAmountUsdCents(total, rate);
      chargeFx = { rate, source: fxSnapshot.source, as_of: fxSnapshot.source_updated_at || fxSnapshot.fetched_at };
    }
    const method = { ...order.shipping_method, rate_kobo: shippingKobo, quoted: true };
    await tx.query(
      `UPDATE orders SET status = 'pending_payment', shipping_kobo = $2, discount_kobo = $3, total_kobo = $4,
              charge_amount_minor = $5, charge_fx = $6, shipping_method = $7,
              expires_at = NOW() + ($8::int * INTERVAL '1 day')
        WHERE id = $1`,
      [orderId, shippingKobo, discount, total, chargeAmount, json(chargeFx), json(method), Math.max(1, paymentDays)]
    );
    await tx.query('INSERT INTO order_events (order_id, status, note, actor_id) VALUES ($1, $2, $3, $4)', [
      orderId, 'pending_payment', note || 'Shipping has been quoted. The order is ready for payment.', actor?.id ?? null,
    ]);
    return { orderId, totalKobo: total };
  });
}

/**
 * Record a refund. With method 'paystack' the refund is requested through the provider first;
 * the order is only updated if the provider accepts the request.
 */
export async function recordRefund(orderId, amountKobo, actor, { reason = '', method = 'manual' } = {}) {
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) throw new CheckoutError('Enter a valid refund amount.', 'amount');
  const order = await one('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!order) throw new CheckoutError('Order not found.', 'not_found');
  if (!['paid', 'partially_refunded'].includes(order.payment_status)) throw new CheckoutError('Only paid orders can be refunded.', 'state');
  const remaining = Number(order.total_kobo) - Number(order.refunded_kobo);
  if (amountKobo > remaining) throw new CheckoutError(`The most you can refund is ${remaining / 100} NGN.`, 'amount');

  let providerRef = null;
  let refundStatus = 'recorded';
  if (method === 'paystack') {
    const pay = await one(`SELECT reference, amount_minor, currency FROM payments WHERE order_id = $1 AND status = 'success'`, [orderId]);
    if (!pay) throw new CheckoutError('No verified payment found for this order.', 'state');
    const full = amountKobo === remaining && Number(order.refunded_kobo) === 0;
    const minor = order.charge_currency === 'NGN'
      ? amountKobo
      : full ? null : Math.floor((amountKobo / Number(order.total_kobo)) * Number(pay.amount_minor));
    const r = await paymentProvider().refund({ reference: pay.reference, amountMinor: minor, currency: pay.currency, note: reason });
    providerRef = r.providerReference;
    refundStatus = r.status === 'processed' ? 'processed' : 'pending';
  }

  return transaction(async (tx) => {
    const o = await tx.one('SELECT total_kobo, refunded_kobo FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const newRefunded = Number(o.refunded_kobo) + amountKobo;
    const fully = newRefunded >= Number(o.total_kobo);
    await tx.query(
      `INSERT INTO refunds (order_id, amount_kobo, reason, method, provider_reference, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId, amountKobo, reason || null, method, providerRef, refundStatus, actor?.id ?? null]
    );
    await tx.query(
      `UPDATE orders SET refunded_kobo = $2, payment_status = $3,
              status = CASE WHEN $4 THEN 'refunded' WHEN status IN ('paid','processing','shipped','delivered') THEN 'partially_refunded' ELSE status END
        WHERE id = $1`,
      [orderId, newRefunded, fully ? 'refunded' : 'partially_refunded', fully]
    );
    await tx.query('INSERT INTO order_events (order_id, status, note, actor_id) VALUES ($1, $2, $3, $4)', [
      orderId, fully ? 'refunded' : 'partially_refunded', `Refund of ₦${(amountKobo / 100).toLocaleString('en-NG')} ${method === 'paystack' ? 'requested via Paystack' : 'recorded'}.`, actor?.id ?? null,
    ]);
    return { refundedKobo: newRefunded, fully };
  });
}
