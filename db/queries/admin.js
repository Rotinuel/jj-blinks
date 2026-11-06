// Admin reads. Callers must have checked permissions.
import { one, query } from '../../lib/db.js';

const PAID = `payment_status IN ('paid','partially_refunded','refunded')`;

function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (c) => '\\' + c);
}

export async function salesSummary(days = 30) {
  return one(
    `SELECT COUNT(*)::int AS orders,
            COALESCE(SUM(subtotal_kobo + COALESCE(shipping_kobo, 0)), 0) AS gross_kobo,
            COALESCE(SUM(discount_kobo), 0) AS discount_kobo,
            COALESCE(SUM(refunded_kobo), 0) AS refunded_kobo,
            COALESCE(SUM(total_kobo - refunded_kobo), 0) AS net_kobo
       FROM orders WHERE ${PAID} AND paid_at >= NOW() - ($1::int * INTERVAL '1 day')`,
    [days]
  );
}

export async function dashboardCounts() {
  return one(
    `SELECT
       (SELECT COUNT(*)::int FROM orders WHERE status = 'pending_payment') AS pending_payment,
       (SELECT COUNT(*)::int FROM orders WHERE status IN ('paid','processing')) AS to_fulfil,
       (SELECT COUNT(*)::int FROM orders WHERE status = 'awaiting_quote') AS awaiting_quote,
       (SELECT COUNT(*)::int FROM orders WHERE needs_attention) AS needs_attention,
       (SELECT COUNT(*)::int FROM custom_requests WHERE status IN ('new','reviewing')) AS open_requests,
       (SELECT COUNT(*)::int FROM reviews WHERE status = 'pending') AS pending_reviews,
       (SELECT COUNT(*)::int FROM contact_messages WHERE status = 'new') AS new_messages`
  );
}

export async function lowStock(limit = 10) {
  return query(
    `SELECT * FROM (
       SELECT p.id, p.name, NULL::text AS variant, p.sku, p.stock, p.low_stock_threshold
         FROM products p
        WHERE p.status = 'published' AND p.track_inventory
          AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)
          AND p.stock <= p.low_stock_threshold
       UNION ALL
       SELECT p.id, p.name, v.option_values::text AS variant, v.sku, v.stock, p.low_stock_threshold
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE p.status = 'published' AND p.track_inventory AND v.is_active AND v.stock <= p.low_stock_threshold
     ) s ORDER BY stock ASC, name LIMIT $1`,
    [limit]
  );
}

export async function listOrders({ status, q, attention, page = 1, perPage = 25 } = {}) {
  const params = [];
  const where = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  if (status) where.push(`o.status = ${add(status)}`);
  if (attention) where.push('o.needs_attention');
  if (q) {
    const like = add(`%${escapeLike(q.trim())}%`);
    where.push(`(o.order_number ILIKE ${like} OR o.email ILIKE ${like} OR o.customer_name ILIKE ${like} OR o.phone ILIKE ${like})`);
  }
  const rows = await query(
    `SELECT o.id, o.order_number, o.kind, o.customer_name, o.email, o.status, o.payment_status, o.total_kobo, o.charge_currency,
            o.needs_attention, o.created_at, o.shipping_address->>'country_code' AS country,
            COUNT(*) OVER() AS total_count
       FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY o.created_at DESC LIMIT ${add(perPage)} OFFSET ${add((page - 1) * perPage)}`,
    params
  );
  const total = rows[0] ? Number(rows[0].total_count) : 0;
  return { rows, total, pages: Math.max(1, Math.ceil(total / perPage)), page };
}

export async function getOrderAdmin(id) {
  const order = await one('SELECT * FROM orders WHERE id = $1', [id]);
  if (!order) return null;
  const [items, events, payments, refunds, customer] = await Promise.all([
    query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [id]),
    query(
      `SELECT e.*, u.name AS actor_name FROM order_events e LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.order_id = $1 ORDER BY e.created_at, e.id`,
      [id]
    ),
    query('SELECT reference, status, amount_minor, currency, channel, gateway_response, paid_at, created_at FROM payments WHERE order_id = $1 ORDER BY created_at', [id]),
    query('SELECT r.*, u.name AS actor_name FROM refunds r LEFT JOIN users u ON u.id = r.created_by WHERE order_id = $1 ORDER BY created_at', [id]),
    order.user_id ? one('SELECT id, name, email FROM users WHERE id = $1', [order.user_id]) : null,
  ]);
  return { order, items, events, payments, refunds, customer };
}

export async function listProductsAdmin({ q, status, category, page = 1, perPage = 30 } = {}) {
  const params = [];
  const where = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  if (status) where.push(`p.status = ${add(status)}`);
  if (category) where.push(`p.category_id = ${add(Number(category))}`);
  if (q) {
    const like = add(`%${escapeLike(q.trim())}%`);
    where.push(`(p.name ILIKE ${like} OR p.sku ILIKE ${like})`);
  }
  const rows = await query(
    `SELECT p.id, p.name, p.slug, p.sku, p.status, p.price_kobo, p.stock, p.track_inventory, p.is_featured, p.is_sample, p.updated_at,
            c.name AS category_name,
            (SELECT COUNT(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variant_count,
            (SELECT COALESCE(SUM(stock), 0)::int FROM product_variants v WHERE v.product_id = p.id AND v.is_active) AS variant_stock,
            (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image_url,
            COUNT(*) OVER() AS total_count
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY p.updated_at DESC LIMIT ${add(perPage)} OFFSET ${add((page - 1) * perPage)}`,
    params
  );
  const total = rows[0] ? Number(rows[0].total_count) : 0;
  return { rows, total, pages: Math.max(1, Math.ceil(total / perPage)), page };
}

export async function getProductAdmin(id) {
  const product = await one('SELECT * FROM products WHERE id = $1', [id]);
  if (!product) return null;
  const [variants, images, movements] = await Promise.all([
    query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY sort_order, id', [id]),
    query('SELECT id, url, alt, sort_order FROM product_images WHERE product_id = $1 ORDER BY sort_order, id', [id]),
    query(
      `SELECT m.*, u.name AS actor_name FROM inventory_movements m LEFT JOIN users u ON u.id = m.actor_id
        WHERE m.product_id = $1 ORDER BY m.created_at DESC LIMIT 20`,
      [id]
    ),
  ]);
  return { product, variants, images, movements };
}

export async function listCategoriesAdmin() {
  return query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id) AS product_count
       FROM categories c ORDER BY c.sort_order, c.name`
  );
}

export async function inventoryRows({ q, low } = {}) {
  const params = [];
  let filter = '';
  if (q) { params.push(`%${escapeLike(q.trim())}%`); filter = `AND (name ILIKE $1 OR sku ILIKE $1)`; }
  return query(
    `SELECT * FROM (
       SELECT p.id AS product_id, NULL::bigint AS variant_id, p.name, NULL::jsonb AS option_values, p.sku, p.stock, p.low_stock_threshold, p.status
         FROM products p WHERE p.track_inventory AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
       UNION ALL
       SELECT p.id, v.id, p.name, v.option_values, v.sku, v.stock, p.low_stock_threshold, p.status
         FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.track_inventory
     ) s WHERE status <> 'archived' ${filter} ${low ? 'AND stock <= low_stock_threshold' : ''}
     ORDER BY stock ASC, name LIMIT 300`,
    params
  );
}

export async function listCustomers({ q, page = 1, perPage = 30 } = {}) {
  const params = [];
  let where = `WHERE u.role = 'customer'`;
  if (q) { params.push(`%${escapeLike(q.trim())}%`); where += ` AND (u.email ILIKE $1 OR u.name ILIKE $1 OR u.phone ILIKE $1)`; }
  params.push(perPage, (page - 1) * perPage);
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at, u.last_login_at,
            (SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id) AS order_count,
            (SELECT COALESCE(SUM(total_kobo - refunded_kobo), 0) FROM orders o WHERE o.user_id = u.id AND o.${PAID}) AS spent_kobo,
            COUNT(*) OVER() AS total_count
       FROM users u ${where} ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const total = rows[0] ? Number(rows[0].total_count) : 0;
  return { rows, total, pages: Math.max(1, Math.ceil(total / perPage)), page };
}

export async function listRequests({ status, kind } = {}) {
  const params = [];
  const where = [];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (kind) { params.push(kind); where.push(`kind = $${params.length}`); }
  return query(
    `SELECT id, reference, kind, status, name, company, email, product_type, quantity, desired_date, quote_kobo, created_at
       FROM custom_requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 200`,
    params
  );
}

export async function getRequestAdmin(id) {
  const req = await one('SELECT * FROM custom_requests WHERE id = $1', [id]);
  if (!req) return null;
  const [events, files, order] = await Promise.all([
    query(`SELECT e.*, u.name AS actor_name FROM custom_request_events e LEFT JOIN users u ON u.id = e.actor_id WHERE request_id = $1 ORDER BY created_at, e.id`, [id]),
    query(`SELECT m.url, m.content_type, f.role FROM custom_request_files f JOIN media_assets m ON m.id = f.media_id WHERE f.request_id = $1`, [id]),
    req.order_id ? one('SELECT id, order_number, status, payment_status FROM orders WHERE id = $1', [req.order_id]) : null,
  ]);
  return { req, events, files, order };
}

export async function analytics(days = 90) {
  const [daily, top, countries, channels, summary] = await Promise.all([
    query(
      `SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
              COALESCE(SUM(o.total_kobo - o.refunded_kobo), 0) AS net_kobo, COUNT(o.id)::int AS orders
         FROM generate_series((NOW() AT TIME ZONE 'Africa/Lagos')::date - ($1::int - 1), (NOW() AT TIME ZONE 'Africa/Lagos')::date, INTERVAL '1 day') d
         LEFT JOIN orders o ON (o.paid_at AT TIME ZONE 'Africa/Lagos')::date = d::date AND o.${PAID}
        GROUP BY d ORDER BY d`,
      [days]
    ),
    query(
      `SELECT oi.name, SUM(oi.quantity)::int AS qty, SUM(oi.line_total_kobo) AS revenue_kobo
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.${PAID} AND o.paid_at >= NOW() - ($1::int * INTERVAL '1 day')
        GROUP BY oi.name ORDER BY revenue_kobo DESC LIMIT 10`,
      [days]
    ),
    query(
      `SELECT shipping_address->>'country_code' AS country, COUNT(*)::int AS orders, SUM(total_kobo - refunded_kobo) AS net_kobo
         FROM orders WHERE ${PAID} AND paid_at >= NOW() - ($1::int * INTERVAL '1 day')
        GROUP BY 1 ORDER BY net_kobo DESC LIMIT 15`,
      [days]
    ),
    query(
      `SELECT COALESCE(p.channel, 'unknown') AS channel, p.currency, COUNT(*)::int AS payments, SUM(p.amount_minor) AS amount_minor
         FROM payments p WHERE p.status = 'success' AND p.paid_at >= NOW() - ($1::int * INTERVAL '1 day')
        GROUP BY 1, 2 ORDER BY payments DESC`,
      [days]
    ),
    salesSummary(days),
  ]);
  return { daily, top, countries, channels, summary };
}
