// Customer-facing order reads. Access is granted only by (a) the signed-in owner, or (b) the
// order's unguessable tracking token, or (c) order number + matching email (lookup form).
import { one, query } from '../../lib/db.js';
import { safeEqual } from '../../lib/utilities.js';

async function details(order) {
  const [items, events] = await Promise.all([
    query(
      `SELECT id, product_id, name, sku, variant_label, customizations, unit_price_kobo, quantity, line_total_kobo, image_url
         FROM order_items WHERE order_id = $1 ORDER BY id`,
      [order.id]
    ),
    query(
      `SELECT status, note, created_at FROM order_events WHERE order_id = $1 AND visible_to_customer ORDER BY created_at, id`,
      [order.id]
    ),
  ]);
  return { order, items, events };
}

export async function getOrderByToken(orderNumber, token) {
  if (!orderNumber || !token) return null;
  const order = await one('SELECT * FROM orders WHERE order_number = $1', [String(orderNumber).slice(0, 40)]);
  if (!order || !safeEqual(order.tracking_token, String(token))) return null;
  return details(order);
}

export async function getOrderForUser(orderNumber, userId) {
  const order = await one('SELECT * FROM orders WHERE order_number = $1 AND user_id = $2', [String(orderNumber).slice(0, 40), userId]);
  return order ? details(order) : null;
}

/** Lookup form: returns { order_number, tracking_token } only if the email matches. */
export async function findOrderForLookup(orderNumber, email) {
  return one(
    `SELECT order_number, tracking_token FROM orders WHERE order_number = $1 AND LOWER(email) = LOWER($2)`,
    [String(orderNumber).trim().toUpperCase().slice(0, 40), String(email).trim().slice(0, 254)]
  );
}

export async function listOrdersForUser(userId, limit = 50) {
  return query(
    `SELECT o.id, o.order_number, o.status, o.payment_status, o.total_kobo, o.created_at,
            (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT $2`,
    [userId, limit]
  );
}

export async function getOrderByPaymentReference(reference) {
  return one(
    `SELECT o.order_number, o.tracking_token, o.status, o.payment_status, p.status AS payment_attempt_status
       FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.reference = $1`,
    [String(reference).slice(0, 100)]
  );
}
