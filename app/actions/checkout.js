'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { clientIp, getCurrentUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { currentFxSnapshot } from '@/lib/fx';
import { indicativePrice, isSnapshotFresh, chargeAmountUsdCents, DISPLAY_CURRENCIES } from '@/lib/currency';
import { rateLimit } from '@/lib/rate-limit';
import { normalizeEmail, validate, validateAddress } from '@/lib/validation';
import { CheckoutError, placeOrder, quoteCheckout, startPayment } from '@/lib/orders';
import { paymentsConfigured } from '@/lib/payments';
import { notifyOrderReceived } from '@/lib/notifications';
import { getOrderByToken } from '@/db/queries/orders';
import { CURRENCY_COOKIE } from '@/lib/storefront';

function serialise(q) {
  return {
    lines: q.lines,
    issues: q.issues,
    subtotalKobo: q.subtotalKobo,
    itemCount: q.itemCount,
    shipping: { status: q.shipping.status, zone: q.shipping.zone, options: q.shipping.options, selectedId: q.shipping.selected?.id ?? null },
    coupon: q.coupon,
    totals: q.totals,
    requiresQuote: q.requiresQuote,
  };
}

/** Server-side quote for the cart and checkout pages. Input is untrusted. */
export async function quoteAction(input) {
  const items = Array.isArray(input?.items) ? input.items : [];
  const countryCode = typeof input?.countryCode === 'string' ? input.countryCode.toUpperCase().slice(0, 2) : null;
  const q = await quoteCheckout({
    items,
    countryCode,
    methodId: input?.methodId ?? null,
    couponCode: typeof input?.couponCode === 'string' ? input.couponCode.slice(0, 32) : '',
    email: normalizeEmail(input?.email) || null,
  });
  const out = serialise(q);
  // Auto-select the only option so totals appear without an extra click.
  if (!out.shipping.selectedId && out.shipping.options.length === 1 && countryCode) {
    return quoteAction({ ...input, methodId: out.shipping.options[0].id });
  }
  const settings = await getSettings();
  const jar = await cookies();
  const display = DISPLAY_CURRENCIES.includes(jar.get(CURRENCY_COOKIE)?.value) ? jar.get(CURRENCY_COOKIE).value : 'NGN';
  const fx = settings.currency.fx_source !== 'none' ? await currentFxSnapshot(settings).catch(() => null) : null;
  const total = out.totals.totalKobo ?? out.subtotalKobo;
  out.display = { currency: display, approx: indicativePrice(total, display, fx) };
  const usdRate = Number(fx?.rates?.USD);
  out.usd = settings.payments.usd_enabled && isSnapshotFresh(fx) && usdRate > 0
    ? { available: true, amountMinor: out.totals.totalKobo ? chargeAmountUsdCents(out.totals.totalKobo, usdRate) : null, asOf: fx.source_updated_at || fx.fetched_at }
    : { available: false };
  out.paymentsReady = paymentsConfigured();
  return out;
}

export async function placeOrderAction(payload) {
  const user = await getCurrentUser();
  if (!(await rateLimit('checkout', await clientIp())).ok) {
    return { ok: false, message: 'Too many checkout attempts. Wait a few minutes and try again.' };
  }
  const contact = validate(payload || {}, { email: { type: 'email', required: true }, delivery_instructions: { max: 500 } });
  const addr = validateAddress(payload?.address || {});
  if (!contact.ok || !addr.ok) {
    return { ok: false, errors: { ...contact.errors, ...addr.errors }, message: 'Check the highlighted fields.' };
  }
  const settings = await getSettings();
  const chargeCurrency = payload?.chargeCurrency === 'USD' ? 'USD' : 'NGN';
  const fx = settings.currency.fx_source !== 'none' ? await currentFxSnapshot(settings).catch(() => null) : null;
  const jar = await cookies();
  const displayCurrency = DISPLAY_CURRENCIES.includes(jar.get(CURRENCY_COOKIE)?.value) ? jar.get(CURRENCY_COOKIE).value : 'NGN';

  // Refuse before reserving stock if this order would need online payment that is not set up.
  const pre = await quoteCheckout({ items: payload?.items, countryCode: addr.address.country_code, methodId: payload?.methodId });
  if (pre.shipping.selected && !pre.shipping.selected.requiresQuote && !paymentsConfigured()) {
    return { ok: false, message: 'Online payment is not available yet. Please contact us on WhatsApp to place this order.' };
  }

  let result;
  try {
    result = await placeOrder(
      {
        items: payload?.items,
        email: contact.data.email,
        name: addr.address.full_name,
        phone: addr.address.phone,
        address: addr.address,
        methodId: payload?.methodId,
        couponCode: typeof payload?.couponCode === 'string' ? payload.couponCode.slice(0, 32) : '',
        deliveryInstructions: contact.data.delivery_instructions,
        displayCurrency,
        displayFx: displayCurrency !== 'NGN' && fx ? { rates: { [displayCurrency]: fx.rates?.[displayCurrency] ?? null }, source: fx.source, as_of: fx.source_updated_at || fx.fetched_at } : null,
        chargeCurrency,
        idempotencyKey: payload?.idempotencyKey,
        userId: user?.id ?? null,
      },
      { settings, fxSnapshot: fx }
    );
  } catch (err) {
    if (err instanceof CheckoutError) return { ok: false, message: err.userMessage, issues: err.details || null, code: err.code };
    console.error('placeOrder failed', err);
    return { ok: false, message: 'We could not place your order. Please try again.' };
  }

  const order = result.order;
  if (!result.duplicate) await notifyOrderReceived(order.id);
  const trackPath = `/track/${encodeURIComponent(order.order_number)}?token=${encodeURIComponent(order.tracking_token)}`;

  if (order.status === 'pending_payment') {
    try {
      const pay = await startPayment(order.id);
      return { ok: true, redirectTo: pay.authorizationUrl, external: true, trackPath };
    } catch (err) {
      return { ok: false, message: err.userMessage || 'Payment could not be started.', placed: true, trackPath };
    }
  }
  return { ok: true, redirectTo: `${trackPath}&placed=1`, external: false, trackPath };
}

/** "Pay now" from the order page (quoted orders, retries). */
export async function payOrderAction(formData) {
  const number = String(formData.get('order') || '');
  const token = String(formData.get('token') || '');
  const found = await getOrderByToken(number, token);
  if (!found) redirect('/track?error=notfound');
  let url;
  try {
    url = (await startPayment(found.order.id)).authorizationUrl;
  } catch (err) {
    redirect(`/track/${encodeURIComponent(number)}?token=${encodeURIComponent(token)}&payerror=${encodeURIComponent(err.userMessage || 'Payment could not be started.')}`);
  }
  redirect(url);
}
