// Transactional email over SMTP (nodemailer — Node has no built-in SMTP client).
// Works with the business Gmail account (smtp.gmail.com + a Gmail app password) and with any
// mailbox that offers SMTP, such as info@jjblinks.com later: switching is an environment change.
// When SMTP is not configured, nothing is sent and callers receive { sent: false } so the UI
// never claims a message went out.
import { appUrl } from './utilities.js';
import { formatMoney } from './currency.js';

/** SMTP settings from the environment, or null when incomplete. */
export function smtpConfig(env = process.env) {
  const host = String(env.SMTP_HOST || '').trim();
  const user = String(env.SMTP_USER || '').trim();
  // Gmail shows app passwords in groups of four ("abcd efgh ijkl mnop"); the spaces are not part of it.
  const pass = String(env.SMTP_PASSWORD || '').replace(/\s+/g, '');
  if (!host || !user || !pass) return null;
  const port = Number(env.SMTP_PORT) || 465;
  return { host, port, secure: port === 465, user, pass };
}

export function emailConfigured(env = process.env) {
  return Boolean(smtpConfig(env));
}

/** The From header. Defaults to the sending account itself, which Gmail requires. */
export function fromAddress(env = process.env, storeName = 'JJ BLINKS') {
  const explicit = String(env.EMAIL_FROM || '').trim();
  if (explicit) return explicit;
  const user = String(env.SMTP_USER || '').trim();
  return user ? `"${storeName.replace(/"/g, '')}" <${user}>` : '';
}

/** Address inside the From header, e.g. orders@x.com from "Shop <orders@x.com>". */
export function addressOf(header) {
  const m = String(header || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(header || '')).trim().toLowerCase();
}

/**
 * Gmail (and most providers) only send "from" the signed-in mailbox or an alias verified in
 * that mailbox's settings; anything else is rewritten. Returns a warning string or null.
 */
export function fromMismatchWarning(env = process.env) {
  const cfg = smtpConfig(env);
  if (!cfg) return null;
  const from = addressOf(fromAddress(env));
  if (from && from !== cfg.user.toLowerCase()) {
    return `EMAIL_FROM uses ${from} but the signed-in mailbox is ${cfg.user}. Unless ${from} is a verified "Send mail as" address in that mailbox, emails will show ${cfg.user} instead.`;
  }
  return null;
}

/** Plain-language reason for a failed send, for the admin test button and logs. */
export function describeEmailError(err) {
  const code = err?.code || '';
  const response = String(err?.response || err?.message || '');
  if (code === 'EAUTH' || /\b535\b|Username and Password not accepted|BadCredentials/i.test(response)) {
    return 'The mail server rejected the sign-in. For Gmail, SMTP_USER must be the full Gmail address and SMTP_PASSWORD must be a Gmail app password (not the normal password), which needs 2-Step Verification turned on.';
  }
  if (/daily user sending limit|\b550[ -]5\.4\.5\b/i.test(response)) {
    return 'The mailbox has reached its daily sending limit. Sending resumes automatically within 24 hours.';
  }
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(code)) {
    return 'Could not reach the mail server. Check SMTP_HOST and SMTP_PORT (Gmail: smtp.gmail.com and 465).';
  }
  if (code === 'EENVELOPE') return 'The recipient address was refused.';
  return 'The email could not be sent. Check the email settings and try again.';
}

let transporterPromise = null;
let transporterKey = null;
async function transporter() {
  const cfg = smtpConfig();
  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.pass}`;
  if (!transporterPromise || transporterKey !== key) {
    transporterKey = key;
    transporterPromise = import('nodemailer').then(({ default: nodemailer }) =>
      nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        requireTLS: !cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      })
    );
  }
  return transporterPromise;
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout(title, bodyHtml, storeName = 'JJ BLINKS') {
  return `<!doctype html><html><body style="margin:0;background:#FFF8F0;font-family:Georgia,serif;color:#21191A">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="letter-spacing:.3em;font-size:12px;color:#650F18;margin:0 0 24px">${esc(storeName.toUpperCase())}</p>
<h1 style="font-weight:normal;font-size:24px;margin:0 0 16px">${esc(title)}</h1>
<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">${bodyHtml}</div>
<hr style="border:none;border-top:1px solid #D6AE63;margin:32px 0 16px">
<p style="font-family:Arial,sans-serif;font-size:12px;color:#6b5a5c">${esc(storeName)} · ${esc(appUrl())}</p>
</div></body></html>`;
}

export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!emailConfigured()) return { sent: false, reason: 'not_configured' };
  try {
    const t = await transporter();
    await t.sendMail({
      from: fromAddress(),
      to,
      subject,
      html,
      text,
      replyTo: replyTo || String(process.env.EMAIL_REPLY_TO || '').trim() || undefined,
    });
    return { sent: true };
  } catch (err) {
    console.error('Email send failed:', err?.code || '', err?.message);
    return { sent: false, reason: 'error', message: describeEmailError(err) };
  }
}

function itemsTable(items) {
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0">${items
    .map(
      (i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eadfd4">${esc(i.name)}${i.variant_label ? ` — ${esc(i.variant_label)}` : ''} × ${i.quantity}</td>
<td style="padding:6px 0;border-bottom:1px solid #eadfd4;text-align:right">${esc(formatMoney(i.line_total_kobo))}</td></tr>`
    )
    .join('')}</table>`;
}

export const templates = {
  test(storeName) {
    const body = `<p>This is a test email from your ${esc(storeName)} store.</p>
<p>If you are reading this, order confirmations, payment receipts and password-reset emails will be delivered.</p>`;
    return { subject: `Test email from ${storeName}`, html: layout('Email is working', body, storeName), text: `Email from your ${storeName} store is working.` };
  },
  orderReceived(order, items, trackUrl, storeName) {
    const awaitingQuote = order.status === 'awaiting_quote';
    const body = `<p>Thank you, ${esc(order.customer_name)}. We have received order <strong>${esc(order.order_number)}</strong>.</p>
${itemsTable(items)}
${awaitingQuote
  ? `<p>Delivery to your address needs a shipping quotation. We will email you the delivery cost and a payment link. Nothing has been charged.</p>`
  : `<p>Total: <strong>${esc(formatMoney(order.total_kobo))}</strong>. We will confirm as soon as your payment is verified.</p>`}
<p><a href="${esc(trackUrl)}" style="color:#8F142A">View your order</a></p>`;
    return { subject: `Order ${order.order_number} received`, html: layout('Order received', body, storeName) };
  },
  paymentConfirmed(order, items, trackUrl, storeName) {
    const body = `<p>Payment for order <strong>${esc(order.order_number)}</strong> has been verified.</p>
${itemsTable(items)}
<p>Total paid: <strong>${esc(formatMoney(order.charge_amount_minor ?? order.total_kobo, order.charge_currency))}</strong></p>
<p>We will let you know when your order ships. <a href="${esc(trackUrl)}" style="color:#8F142A">Track your order</a></p>`;
    return { subject: `Payment confirmed — ${order.order_number}`, html: layout('Payment confirmed', body, storeName) };
  },
  statusUpdate(order, statusLabel, note, trackUrl, storeName) {
    const tracking = order.tracking_number
      ? `<p>Carrier: ${esc(order.carrier || '—')}<br>Tracking number: ${esc(order.tracking_number)}${order.tracking_url ? `<br><a href="${esc(order.tracking_url)}" style="color:#8F142A">Carrier tracking</a>` : ''}</p>`
      : '';
    const body = `<p>Your order <strong>${esc(order.order_number)}</strong> is now: <strong>${esc(statusLabel)}</strong>.</p>
${note ? `<p>${esc(note)}</p>` : ''}${tracking}<p><a href="${esc(trackUrl)}" style="color:#8F142A">View your order</a></p>`;
    return { subject: `Order ${order.order_number}: ${statusLabel}`, html: layout('Order update', body, storeName) };
  },
  shippingQuoted(order, payUrl, storeName) {
    const body = `<p>We have quoted delivery for order <strong>${esc(order.order_number)}</strong>.</p>
<p>Shipping: <strong>${esc(formatMoney(order.shipping_kobo))}</strong><br>Order total: <strong>${esc(formatMoney(order.total_kobo))}</strong></p>
<p><a href="${esc(payUrl)}" style="color:#8F142A">Review and pay</a></p>`;
    return { subject: `Shipping quote for ${order.order_number}`, html: layout('Your shipping quotation', body, storeName) };
  },
  passwordReset(name, url, storeName) {
    const body = `<p>Hello ${esc(name)},</p><p>Use the link below to choose a new password. It expires in 60 minutes and can be used once.</p>
<p><a href="${esc(url)}" style="color:#8F142A">Reset your password</a></p><p>If you did not ask for this, you can ignore this email.</p>`;
    return { subject: 'Reset your password', html: layout('Password reset', body, storeName) };
  },
  requestReceived(req, trackUrl, storeName) {
    const body = `<p>Thank you, ${esc(req.name)}. Your ${req.kind === 'bulk' ? 'bulk order' : 'custom order'} request <strong>${esc(req.reference)}</strong> has been received.</p>
<p>We will review it and send a quotation. You will not be charged unless you approve a quotation.</p>
<p><a href="${esc(trackUrl)}" style="color:#8F142A">View your request</a></p>`;
    return { subject: `Request ${req.reference} received`, html: layout('Request received', body, storeName) };
  },
  requestStaffAlert(req, adminUrl, storeName) {
    const body = `<p>New ${esc(req.kind)} request <strong>${esc(req.reference)}</strong> from ${esc(req.name)} (${esc(req.email)}, ${esc(req.phone)}).</p>
<p>${esc(req.product_type)} × ${req.quantity}</p><p><a href="${esc(adminUrl)}">Open in admin</a></p>`;
    return { subject: `New ${req.kind} request ${req.reference}`, html: layout('New request', body, storeName) };
  },
  requestQuoted(req, trackUrl, storeName) {
    const body = `<p>Your quotation for request <strong>${esc(req.reference)}</strong> is ready.</p>
<p>Amount: <strong>${esc(formatMoney(req.quote_kobo))}</strong>${req.quote_valid_until ? `<br>Valid until: ${esc(req.quote_valid_until)}` : ''}</p>
${req.quote_notes ? `<p>${esc(req.quote_notes)}</p>` : ''}
<p><a href="${esc(trackUrl)}" style="color:#8F142A">Review the quotation</a></p>`;
    return { subject: `Quotation for ${req.reference}`, html: layout('Your quotation', body, storeName) };
  },
  requestStatus(req, statusLabel, note, trackUrl, storeName) {
    const body = `<p>Your request <strong>${esc(req.reference)}</strong> is now: <strong>${esc(statusLabel)}</strong>.</p>
${note ? `<p>${esc(note)}</p>` : ''}<p><a href="${esc(trackUrl)}" style="color:#8F142A">View your request</a></p>`;
    return { subject: `Request ${req.reference}: ${statusLabel}`, html: layout('Request update', body, storeName) };
  },
};
