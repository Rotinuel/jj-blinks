'use server';

import { cookies } from 'next/headers';
import { DISPLAY_CURRENCIES } from '@/lib/currency';
import { CURRENCY_COOKIE } from '@/lib/storefront';
import { clientIp } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { query } from '@/lib/db';
import { normalizeEmail, validate } from '@/lib/validation';
import { sendEmail } from '@/lib/email';
import { getSettings } from '@/lib/settings';

export async function setCurrencyAction(formData) {
  const c = String(formData.get('currency') || 'NGN');
  if (!DISPLAY_CURRENCIES.includes(c)) return;
  (await cookies()).set(CURRENCY_COOKIE, c, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 180 });
}

export async function subscribeAction(_prev, formData) {
  if (formData.get('website')) return { ok: true, message: 'Thank you.' }; // honeypot
  const email = normalizeEmail(formData.get('email'));
  if (!email) return { ok: false, message: 'Enter a valid email address.' };
  if (!formData.get('consent')) return { ok: false, message: 'Tick the box to confirm you want our emails.' };
  if (!(await rateLimit('newsletter', await clientIp())).ok) return { ok: false, message: 'Too many attempts. Try again later.' };
  await query(
    `INSERT INTO newsletter_subscribers (email, source) VALUES ($1, 'footer')
     ON CONFLICT ((LOWER(email))) DO UPDATE SET unsubscribed_at = NULL, consented_at = NOW()`,
    [email]
  );
  return { ok: true, message: 'You are on the list.' };
}

export async function contactAction(_prev, formData) {
  if (formData.get('website')) return { ok: true, message: 'Message received.' };
  const { data, errors, ok } = validate(formData, {
    name: { required: true, max: 120 },
    email: { type: 'email', required: true },
    phone: { max: 40 },
    subject: { max: 160 },
    message: { required: true, max: 4000, min: 5 },
  });
  if (!ok) return { ok: false, errors, message: 'Check the highlighted fields.' };
  if (!(await rateLimit('contact', await clientIp())).ok) return { ok: false, message: 'Too many messages. Try again later or use WhatsApp.' };
  await query('INSERT INTO contact_messages (name, email, phone, subject, message) VALUES ($1, $2, $3, $4, $5)', [
    data.name, data.email, data.phone, data.subject, data.message,
  ]);
  const settings = await getSettings();
  const res = await sendEmail({
    to: settings.store.email,
    replyTo: data.email,
    subject: `Website enquiry: ${data.subject || data.name}`,
    text: `${data.message}\n\n— ${data.name} <${data.email}> ${data.phone || ''}`,
  });
  return {
    ok: true,
    message: res.sent
      ? 'Message sent. We will reply by email.'
      : 'Message received. We will reply by email — for anything urgent, use WhatsApp.',
  };
}
