// Best-effort customer/staff notifications. Failures are logged, never thrown, and callers
// get { sent } so nothing claims an email was delivered when SMTP is not configured.
import { one, query } from './db.js';
import { sendEmail, templates } from './email.js';
import { getSettings } from './settings.js';
import { ORDER_STATUS_LABELS, orderTrackUrl } from './orders.js';
import { appUrl } from './utilities.js';

async function loadOrder(orderId) {
  const order = await one('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!order) return null;
  const items = await query('SELECT name, variant_label, quantity, line_total_kobo FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
  return { order, items };
}

async function storeName() {
  try { return (await getSettings()).store.name; } catch { return 'JJ BLINKS'; }
}

export async function notifyOrderReceived(orderId) {
  try {
    const d = await loadOrder(orderId);
    if (!d) return { sent: false };
    const t = templates.orderReceived(d.order, d.items, orderTrackUrl(d.order), await storeName());
    return sendEmail({ to: d.order.email, ...t });
  } catch (e) { console.error('notifyOrderReceived', e?.message); return { sent: false }; }
}

export async function notifyPaymentConfirmed(orderId) {
  try {
    const d = await loadOrder(orderId);
    if (!d) return { sent: false };
    const t = templates.paymentConfirmed(d.order, d.items, orderTrackUrl(d.order), await storeName());
    return sendEmail({ to: d.order.email, ...t });
  } catch (e) { console.error('notifyPaymentConfirmed', e?.message); return { sent: false }; }
}

export async function notifyOrderStatus(orderId, note) {
  try {
    const d = await loadOrder(orderId);
    if (!d) return { sent: false };
    const t = templates.statusUpdate(d.order, ORDER_STATUS_LABELS[d.order.status] || d.order.status, note, orderTrackUrl(d.order), await storeName());
    return sendEmail({ to: d.order.email, ...t });
  } catch (e) { console.error('notifyOrderStatus', e?.message); return { sent: false }; }
}

export async function notifyShippingQuoted(orderId) {
  try {
    const d = await loadOrder(orderId);
    if (!d) return { sent: false };
    const t = templates.shippingQuoted(d.order, orderTrackUrl(d.order), await storeName());
    return sendEmail({ to: d.order.email, ...t });
  } catch (e) { console.error('notifyShippingQuoted', e?.message); return { sent: false }; }
}

export function requestTrackUrl(req) {
  return appUrl(`/requests/${encodeURIComponent(req.reference)}?token=${encodeURIComponent(req.tracking_token)}`);
}

export async function notifyRequestReceived(requestId) {
  try {
    const req = await one('SELECT * FROM custom_requests WHERE id = $1', [requestId]);
    if (!req) return { sent: false };
    const settings = await getSettings();
    const t = templates.requestReceived(req, requestTrackUrl(req), settings.store.name);
    const res = await sendEmail({ to: req.email, ...t });
    if (settings.store.email) {
      const s = templates.requestStaffAlert(req, appUrl(`/admin/requests/${req.id}`), settings.store.name);
      await sendEmail({ to: settings.store.email, replyTo: req.email, ...s });
    }
    return res;
  } catch (e) { console.error('notifyRequestReceived', e?.message); return { sent: false }; }
}

export async function notifyRequestQuoted(requestId) {
  try {
    const req = await one('SELECT * FROM custom_requests WHERE id = $1', [requestId]);
    if (!req) return { sent: false };
    const t = templates.requestQuoted(req, requestTrackUrl(req), await storeName());
    return sendEmail({ to: req.email, ...t });
  } catch (e) { console.error('notifyRequestQuoted', e?.message); return { sent: false }; }
}

export async function notifyRequestStatus(requestId, label, note) {
  try {
    const req = await one('SELECT * FROM custom_requests WHERE id = $1', [requestId]);
    if (!req) return { sent: false };
    const t = templates.requestStatus(req, label, note, requestTrackUrl(req), await storeName());
    return sendEmail({ to: req.email, ...t });
  } catch (e) { console.error('notifyRequestStatus', e?.message); return { sent: false }; }
}
