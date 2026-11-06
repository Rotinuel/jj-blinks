// Paystack integration (server-only). Uses the redirect checkout (authorization_url), so no
// Paystack script runs on our pages and the public key is not needed.
// Docs: https://paystack.com/docs/api/transaction/ · https://paystack.com/docs/payments/webhooks/
import { createHmac, timingSafeEqual } from 'node:crypto';

const BASE_URL = 'https://api.paystack.co';

export function isConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

function secret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  return key;
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok || !json?.status) {
    const err = new Error(json?.message || `Paystack request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

export async function initialize({ email, amountMinor, currency, reference, callbackUrl, metadata }) {
  const data = await call('/transaction/initialize', {
    method: 'POST',
    body: { email, amount: amountMinor, currency, reference, callback_url: callbackUrl, metadata },
  });
  return { authorizationUrl: data.authorization_url, reference: data.reference, accessCode: data.access_code };
}

/** Normalised verification result. Only fields we rely on are returned. */
export async function verify(reference) {
  const d = await call(`/transaction/verify/${encodeURIComponent(reference)}`);
  return normalise(d);
}

export function normalise(d) {
  return {
    status: d?.status, // 'success' | 'failed' | 'abandoned' | 'ongoing' | 'pending' | 'processing' | 'queued' | 'reversed'
    reference: d?.reference,
    amountMinor: Number(d?.amount),
    currency: d?.currency,
    transactionId: d?.id !== undefined ? String(d.id) : null,
    channel: d?.channel || null,
    gatewayResponse: d?.gateway_response || null,
    paidAt: d?.paid_at || d?.paidAt || null,
  };
}

export async function refund({ reference, amountMinor, currency, note }) {
  const body = { transaction: reference };
  if (amountMinor) body.amount = amountMinor;
  if (currency) body.currency = currency;
  if (note) body.merchant_note = note.slice(0, 200);
  const d = await call('/refund', { method: 'POST', body });
  return { status: d?.status || 'pending', providerReference: d?.id !== undefined ? String(d.id) : null };
}

/**
 * Paystack signs the raw request body with HMAC-SHA512 using the secret key and sends it in
 * the `x-paystack-signature` header.
 */
export function verifySignature(rawBody, signature, key = process.env.PAYSTACK_SECRET_KEY) {
  if (!key || !signature || typeof signature !== 'string') return false;
  const expected = createHmac('sha512', key).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Remove card/authorisation and customer detail before storing a webhook payload. */
export function sanitizeEvent(event) {
  const d = event?.data || {};
  return {
    event: event?.event,
    data: {
      id: d.id,
      reference: d.reference,
      status: d.status,
      amount: d.amount,
      currency: d.currency,
      channel: d.channel,
      gateway_response: d.gateway_response,
      paid_at: d.paid_at || d.paidAt,
      transaction_reference: d.transaction?.reference,
    },
  };
}
