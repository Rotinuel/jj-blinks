'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { clientIp, getCurrentUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { normalizePhone, validate } from '@/lib/validation';
import { isValidCountry } from '@/lib/countries';
import { parseNairaToKobo } from '@/lib/currency';
import { acceptQuote, createRequest, getRequestForCustomer } from '@/lib/custom-requests';
import { CheckoutError, startPayment } from '@/lib/orders';
import { notifyRequestReceived } from '@/lib/notifications';
import { getSettings } from '@/lib/settings';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

function ids(v) {
  return String(v || '').split(',').map((s) => Number(s)).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 6);
}

export async function createRequestAction(_prev, formData) {
  if (formData.get('website')) return { ok: false, message: 'Request could not be sent.' };
  const kind = formData.get('kind') === 'bulk' ? 'bulk' : 'custom';
  const { data, errors } = validate(formData, {
    name: { required: true, max: 120, label: kind === 'bulk' ? 'contact name' : 'name' },
    email: { type: 'email', required: true },
    phone: { required: true, max: 32 },
    company: { required: kind === 'bulk', max: 160, label: 'organisation' },
    country_code: { required: true, max: 2, label: 'country' },
    product_type: { required: true, max: 120, label: 'product' },
    occasion: { max: 160 },
    style_description: { required: true, min: 10, max: 4000, label: kind === 'bulk' ? 'customisation details' : 'style description' },
    colours: { max: 300 },
    quantity: { type: 'int', required: true, min: 1, max: 100000 },
    desired_date: { type: 'date', label: 'date needed' },
    notes: { max: 2000 },
    garment_type: { max: 120 },
    garment_colour: { max: 120 },
    branding: { max: 2000 },
  });
  const country = String(data.country_code || '').toUpperCase();
  if (data.country_code && !isValidCountry(country)) errors.country_code = 'Choose your country.';
  const phone = normalizePhone(data.phone, country || 'NG');
  if (data.phone && !phone) errors.phone = 'Enter a phone number with country code.';
  const budgetRaw = String(formData.get('budget') || '').trim();
  const budget = budgetRaw ? parseNairaToKobo(budgetRaw) : null;
  if (budgetRaw && budget === null) errors.budget = 'Enter an amount in naira, e.g. 150000.';
  if (data.desired_date && data.desired_date < new Date().toISOString().slice(0, 10)) errors.desired_date = 'Choose a future date.';

  const sizes = {};
  for (const s of SIZES) {
    const n = Number.parseInt(formData.get(`size_${s}`), 10);
    if (Number.isSafeInteger(n) && n > 0 && n <= 100000) sizes[s] = n;
  }
  const isApparel = Boolean(data.garment_type || Object.keys(sizes).length || data.branding);
  if (Object.keys(errors).length) return { ok: false, errors, message: 'Check the highlighted fields.' };
  if (!(await rateLimit('customRequest', await clientIp())).ok) return { ok: false, message: 'Too many requests. Try again later or message us on WhatsApp.' };

  const user = await getCurrentUser();
  const ownerKey = (await cookies()).get('jjb_upl')?.value || null;
  const req = await createRequest(
    {
      kind, name: data.name, email: data.email, phone, company: data.company, country_code: country,
      product_type: data.product_type, occasion: data.occasion, style_description: data.style_description,
      colours: data.colours, quantity: data.quantity, desired_date: data.desired_date,
      budget_amount: budget, budget_currency: budget ? 'NGN' : null,
      apparel: isApparel ? { garment_type: data.garment_type, sizes, garment_colour: data.garment_colour, branding: data.branding } : null,
      details: data.notes ? { notes: data.notes } : {},
    },
    { mediaIds: { reference: ids(formData.get('reference_ids')), logo: ids(formData.get('logo_ids')) }, ownerKey, userId: user?.id ?? null }
  );
  await notifyRequestReceived(req.id);
  redirect(`/requests/${encodeURIComponent(req.reference)}?token=${encodeURIComponent(req.tracking_token)}&new=1`);
}

export async function acceptQuoteAction(formData) {
  const reference = String(formData.get('reference') || '');
  const token = String(formData.get('token') || '');
  const back = `/requests/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}`;
  const found = await getRequestForCustomer(reference, token);
  if (!found) redirect('/');
  let url;
  try {
    const settings = await getSettings();
    const order = await acceptQuote(reference, token, { paymentWindowDays: settings.payments.quote_payment_days });
    url = (await startPayment(order.id)).authorizationUrl;
  } catch (err) {
    const msg = err instanceof CheckoutError ? err.userMessage : 'Something went wrong. Please try again.';
    redirect(`${back}&error=${encodeURIComponent(msg)}`);
  }
  redirect(url);
}
