// Custom and bulk order requests: enquiry → review → quotation → customer approval → payment
// → production. Nothing is charged until an authorised staff member issues a quotation and the
// customer accepts it.
import { json, one, query, transaction } from './db.js';
import { CheckoutError } from './orders.js';
import { orderNumber, randomToken, safeEqual, sha256, shortCode } from './utilities.js';

export const REQUEST_STATUSES = ['new', 'reviewing', 'quoted', 'approved', 'in_production', 'ready', 'completed', 'rejected', 'cancelled'];
export const REQUEST_STATUS_LABELS = {
  new: 'Received',
  reviewing: 'Under review',
  quoted: 'Quotation sent',
  approved: 'Approved',
  in_production: 'In production',
  ready: 'Ready',
  completed: 'Completed',
  rejected: 'Declined',
  cancelled: 'Cancelled',
};

/** Staff transitions. 'quoted' is reached via issueQuote, 'approved' via customer acceptance (or staff on the customer's written approval). */
export const REQUEST_TRANSITIONS = {
  new: ['reviewing', 'rejected', 'cancelled'],
  reviewing: ['rejected', 'cancelled'],
  quoted: ['reviewing', 'approved', 'cancelled'],
  approved: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
};

export function canRequestTransition(from, to) {
  return (REQUEST_TRANSITIONS[from] || []).includes(to);
}

/**
 * data: validated fields. mediaIds: { reference: [ids], logo: [ids] } belonging to `ownerKey`.
 */
export async function createRequest(data, { mediaIds = { reference: [], logo: [] }, ownerKey = null, userId = null } = {}) {
  const ownerHash = ownerKey ? sha256(ownerKey) : null;
  return transaction(async (tx) => {
    const token = randomToken(24);
    let req = null;
    for (let i = 0; i < 3 && !req; i++) {
      const reference = `${data.kind === 'bulk' ? 'BLK' : 'CUS'}-${shortCode(6)}`;
      const exists = await tx.one('SELECT 1 AS x FROM custom_requests WHERE reference = $1', [reference]);
      if (exists) continue;
      req = await tx.one(
        `INSERT INTO custom_requests (reference, kind, user_id, name, email, phone, company, country_code, product_type,
                                      occasion, style_description, colours, quantity, desired_date, budget_amount, budget_currency,
                                      apparel, details, tracking_token)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [
          reference, data.kind, userId, data.name, data.email, data.phone, data.company || null, data.country_code || null,
          data.product_type, data.occasion || null, data.style_description, data.colours || null, data.quantity,
          data.desired_date || null, data.budget_amount ?? null, data.budget_amount ? data.budget_currency || 'NGN' : null,
          data.apparel ? json(data.apparel) : null, json(data.details || {}), token,
        ]
      );
    }
    if (!req) throw new CheckoutError('Could not create the request. Please try again.', 'retry');

    for (const role of ['reference', 'logo']) {
      const ids = (mediaIds[role] || []).filter((n) => Number.isSafeInteger(n)).slice(0, 6);
      if (!ids.length) continue;
      // Only attach files uploaded by this same visitor and not yet used elsewhere.
      const owned = await tx.query(
        `UPDATE media_assets SET attached = TRUE
          WHERE id = ANY($1::bigint[]) AND attached = FALSE AND purpose = $2
            AND ((owner_key_hash IS NOT NULL AND owner_key_hash = $3) OR (uploaded_by IS NOT NULL AND uploaded_by = $4))
          RETURNING id`,
        [ids, role === 'logo' ? 'logo' : 'custom_reference', ownerHash, userId]
      );
      for (const m of owned) {
        await tx.query('INSERT INTO custom_request_files (request_id, media_id, role) VALUES ($1, $2, $3)', [req.id, m.id, role]);
      }
    }
    await tx.query('INSERT INTO custom_request_events (request_id, status, note) VALUES ($1, $2, $3)', [
      req.id, 'new', 'Request received.',
    ]);
    return req;
  });
}

export async function issueQuote(requestId, { quoteKobo, notes, validUntil }, actor) {
  if (!Number.isSafeInteger(quoteKobo) || quoteKobo <= 0) throw new CheckoutError('Enter a valid quotation amount.', 'amount');
  return transaction(async (tx) => {
    const req = await tx.one('SELECT * FROM custom_requests WHERE id = $1 FOR UPDATE', [requestId]);
    if (!req) throw new CheckoutError('Request not found.', 'not_found');
    if (!['new', 'reviewing', 'quoted'].includes(req.status)) throw new CheckoutError('This request can no longer be quoted.', 'state');
    if (req.order_id) throw new CheckoutError('This quotation has already been accepted.', 'state');
    const updated = await tx.one(
      `UPDATE custom_requests SET status = 'quoted', quote_kobo = $2, quote_notes = $3, quote_valid_until = $4,
              quoted_at = NOW(), quoted_by = $5 WHERE id = $1 RETURNING *`,
      [requestId, quoteKobo, notes || null, validUntil || null, actor?.id ?? null]
    );
    await tx.query('INSERT INTO custom_request_events (request_id, status, note, actor_id) VALUES ($1, $2, $3, $4)', [
      requestId, 'quoted', 'Quotation issued.', actor?.id ?? null,
    ]);
    return updated;
  });
}

export async function updateRequestStatus(requestId, to, actor, { note = '', visible = true } = {}) {
  return transaction(async (tx) => {
    const req = await tx.one('SELECT * FROM custom_requests WHERE id = $1 FOR UPDATE', [requestId]);
    if (!req) throw new CheckoutError('Request not found.', 'not_found');
    if (!canRequestTransition(req.status, to)) throw new CheckoutError(`Cannot move from "${req.status}" to "${to}".`, 'transition');
    if (to === 'approved' && !req.quote_kobo) throw new CheckoutError('Issue a quotation before approving.', 'state');
    await tx.query(
      `UPDATE custom_requests SET status = $2, approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE approved_at END WHERE id = $1`,
      [requestId, to]
    );
    await tx.query(
      'INSERT INTO custom_request_events (request_id, status, note, visible_to_customer, actor_id) VALUES ($1, $2, $3, $4, $5)',
      [requestId, to, note || null, visible, actor?.id ?? null]
    );
    return { from: req.status, to };
  });
}

/**
 * Customer accepts the quotation (authenticated by tracking token). Creates a payable order
 * for exactly the quoted amount. Returns the order.
 */
export async function acceptQuote(reference, token, { paymentWindowDays = 3 } = {}) {
  return transaction(async (tx) => {
    const req = await tx.one('SELECT * FROM custom_requests WHERE reference = $1 FOR UPDATE', [reference]);
    if (!req || !token || !safeEqual(req.tracking_token, token)) throw new CheckoutError('Request not found.', 'not_found');
    if (req.order_id) {
      return tx.one('SELECT * FROM orders WHERE id = $1', [req.order_id]);
    }
    if (req.status !== 'quoted' || !req.quote_kobo) throw new CheckoutError('There is no open quotation to accept.', 'state');
    if (req.quote_valid_until && new Date(req.quote_valid_until + 'T23:59:59Z') < new Date()) {
      throw new CheckoutError('This quotation has expired. Please contact us for an updated quote.', 'expired');
    }
    const order = await tx.one(
      `INSERT INTO orders (order_number, kind, user_id, email, phone, customer_name, status, subtotal_kobo, discount_kobo,
                           shipping_kobo, total_kobo, charge_currency, charge_amount_minor, shipping_address, shipping_method,
                           tracking_token, custom_request_id, expires_at)
       VALUES ($1, 'custom', $2, $3, $4, $5, 'pending_payment', $6, 0, 0, $6, 'NGN', $6, $7, $8, $9, $10,
               NOW() + ($11::int * INTERVAL '1 day'))
       RETURNING *`,
      [
        orderNumber(), req.user_id, req.email, req.phone, req.name, req.quote_kobo,
        json({ full_name: req.name, phone: req.phone, country_code: req.country_code || 'NG', note: 'Delivery as agreed in the quotation' }),
        json({ type: 'included', name: 'As agreed in quotation', requires_quote: false }),
        randomToken(24), req.id, Math.max(1, paymentWindowDays),
      ]
    );
    await tx.query(
      `INSERT INTO order_items (order_id, name, sku, unit_price_kobo, quantity, line_total_kobo, customizations)
       VALUES ($1, $2, $3, $4, 1, $4, $5)`,
      [order.id, `${req.kind === 'bulk' ? 'Bulk order' : 'Custom order'} ${req.reference} — ${req.product_type}`, req.reference, req.quote_kobo, json({ request: req.reference, quantity: req.quantity })]
    );
    await tx.query('INSERT INTO order_events (order_id, status, note) VALUES ($1, $2, $3)', [
      order.id, 'pending_payment', `Quotation for ${req.reference} accepted by the customer.`,
    ]);
    await tx.query(`UPDATE custom_requests SET status = 'approved', approved_at = NOW(), order_id = $2 WHERE id = $1`, [req.id, order.id]);
    await tx.query('INSERT INTO custom_request_events (request_id, status, note) VALUES ($1, $2, $3)', [
      req.id, 'approved', 'Quotation accepted. Awaiting payment.',
    ]);
    return order;
  });
}

export async function getRequestForCustomer(reference, token) {
  const req = await one('SELECT * FROM custom_requests WHERE reference = $1', [reference]);
  if (!req || !token || !safeEqual(req.tracking_token, token)) return null;
  const [events, files, order] = await Promise.all([
    query('SELECT status, note, created_at FROM custom_request_events WHERE request_id = $1 AND visible_to_customer ORDER BY created_at', [req.id]),
    query(`SELECT m.url, m.content_type, f.role FROM custom_request_files f JOIN media_assets m ON m.id = f.media_id WHERE f.request_id = $1`, [req.id]),
    req.order_id ? one('SELECT order_number, status, tracking_token FROM orders WHERE id = $1', [req.order_id]) : null,
  ]);
  return { req, events, files, order };
}
