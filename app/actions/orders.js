'use server';

import { redirect } from 'next/navigation';
import { clientIp } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { normalizeEmail } from '@/lib/validation';
import { findOrderForLookup } from '@/db/queries/orders';

export async function trackLookupAction(_prev, formData) {
  const number = String(formData.get('order') || '').trim();
  const email = normalizeEmail(formData.get('email'));
  if (!number || !email) return { message: 'Enter your order number and the email used to order.' };
  if (!(await rateLimit('track', await clientIp())).ok) return { message: 'Too many attempts. Try again in a few minutes.' };
  const found = await findOrderForLookup(number, email);
  if (!found) return { message: 'We could not find an order with those details.' };
  redirect(`/track/${encodeURIComponent(found.order_number)}?token=${encodeURIComponent(found.tracking_token)}`);
}
