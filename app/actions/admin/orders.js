'use server';

import { revalidatePath } from 'next/cache';
import { adminAction, UserError } from '@/lib/admin-action';
import { updateOrderStatus, setShippingQuote, recordRefund } from '@/lib/order-admin';
import { verifyAndConfirm, ORDER_STATUS_LABELS } from '@/lib/orders';
import { notifyOrderStatus, notifyPaymentConfirmed, notifyShippingQuoted } from '@/lib/notifications';
import { parseNairaToKobo } from '@/lib/currency';
import { query } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { currentFxSnapshot } from '@/lib/fx';
import { cleanString } from '@/lib/validation';

const back = (id) => `/admin/orders/${id}`;

export async function updateStatusAction(formData) {
  const id = Number(formData.get('id'));
  const to = String(formData.get('status') || '');
  await adminAction('orders.update', back(id), async (user) => {
    if (!ORDER_STATUS_LABELS[to]) throw new UserError('Choose a status.');
    const trackingUrl = cleanString(formData.get('tracking_url'), 300);
    if (trackingUrl && !/^https:\/\//.test(trackingUrl)) throw new UserError('Tracking link must start with https://');
    const note = cleanString(formData.get('note'), 500);
    await updateOrderStatus(id, to, user, {
      note, carrier: cleanString(formData.get('carrier'), 80), trackingNumber: cleanString(formData.get('tracking_number'), 80), trackingUrl,
    });
    await audit(user, 'order.status', { entityType: 'order', entityId: id, details: { to } });
    let sent = { sent: false };
    if (formData.get('notify') === 'on') sent = await notifyOrderStatus(id, note);
    revalidatePath(back(id));
    return { ok: `Order marked ${ORDER_STATUS_LABELS[to].toLowerCase()}.${formData.get('notify') === 'on' ? (sent.sent ? ' Customer emailed.' : ' Email not sent (email is not configured).') : ''}` };
  });
}

export async function quoteShippingAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('orders.update', back(id), async (user) => {
    const kobo = parseNairaToKobo(formData.get('shipping'));
    if (kobo === null) throw new UserError('Enter the shipping cost in naira.');
    const settings = await getSettings();
    const fx = await currentFxSnapshot(settings).catch(() => null);
    await setShippingQuote(id, kobo, user, { fxSnapshot: fx, paymentDays: settings.payments.quote_payment_days, note: cleanString(formData.get('note'), 500) });
    await audit(user, 'order.shipping_quote', { entityType: 'order', entityId: id, details: { shipping_kobo: kobo } });
    const sent = await notifyShippingQuoted(id);
    return { ok: sent.sent ? 'Shipping quoted and payment link emailed.' : 'Shipping quoted. Email is not configured — send the customer their order link.' };
  });
}

export async function refundAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('orders.refund', back(id), async (user) => {
    const kobo = parseNairaToKobo(formData.get('amount'));
    if (!kobo) throw new UserError('Enter the refund amount in naira.');
    const method = formData.get('method') === 'paystack' ? 'paystack' : 'manual';
    const r = await recordRefund(id, kobo, user, { reason: cleanString(formData.get('reason'), 300), method });
    await audit(user, 'order.refund', { entityType: 'order', entityId: id, details: { amount_kobo: kobo, method } });
    return { ok: r.fully ? 'Order fully refunded.' : 'Partial refund recorded.' };
  });
}

export async function orderNoteAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('orders.update', back(id), async (user) => {
    const note = cleanString(formData.get('note'), 1000);
    if (!note) throw new UserError('Write a note first.');
    const visible = formData.get('visible') === 'on';
    await query('INSERT INTO order_events (order_id, note, visible_to_customer, actor_id) VALUES ($1, $2, $3, $4)', [id, note, visible, user.id]);
    return { ok: visible ? 'Note added and shown to the customer.' : 'Internal note added.' };
  });
}

export async function clearAttentionAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('orders.update', back(id), async (user) => {
    await query('UPDATE orders SET needs_attention = FALSE WHERE id = $1', [id]);
    await query('INSERT INTO order_events (order_id, note, visible_to_customer, actor_id) VALUES ($1, $2, FALSE, $3)', [id, `Attention cleared: ${cleanString(formData.get('resolution'), 300) || 'reviewed'}`, user.id]);
    await audit(user, 'order.attention_cleared', { entityType: 'order', entityId: id });
    return { ok: 'Marked as reviewed.' };
  });
}

/** Reconciliation: ask Paystack about every unresolved payment attempt for this order. */
export async function reconcileAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('orders.view', back(id), async () => {
    const pays = await query(`SELECT reference FROM payments WHERE order_id = $1 AND status = 'initialized'`, [id]);
    if (!pays.length) return { ok: 'No unresolved payment attempts.' };
    const results = [];
    for (const p of pays) {
      const r = await verifyAndConfirm(p.reference);
      if (r.newlyPaid) await notifyPaymentConfirmed(r.orderId);
      results.push(`${p.reference}: ${r.status}`);
    }
    return { ok: `Checked with Paystack — ${results.join('; ')}` };
  });
}
