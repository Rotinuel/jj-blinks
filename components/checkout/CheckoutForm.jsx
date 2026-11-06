'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { placeOrderAction, quoteAction } from '@/app/actions/checkout';
import { formatMoney } from '@/lib/currency';
import { addressFormat, listCountries } from '@/lib/countries';
import CountryCombobox from './CountryCombobox';

const EMPTY = { full_name: '', phone: '', country_code: 'NG', region: '', city: '', postal_code: '', line1: '', line2: '' };

export default function CheckoutForm({ user, addresses, customsNotice, processingNote }) {
  const { items, ready } = useCart();
  const countries = useMemo(() => listCountries(), []);
  const def = addresses.find((a) => a.is_default) || addresses[0];
  const [address, setAddress] = useState(def ? pick(def) : { ...EMPTY, full_name: user?.name || '', phone: user?.phone || '' });
  const [email, setEmail] = useState(user?.email || '');
  const [methodId, setMethodId] = useState(null);
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [instructions, setInstructions] = useState('');
  const [chargeCurrency, setChargeCurrency] = useState('NGN');
  const [quote, setQuote] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [quoting, startQuote] = useTransition();
  const [placing, startPlace] = useTransition();
  const idem = useRef(null);
  const fmt = addressFormat(address.country_code);

  useEffect(() => { idem.current ??= crypto.randomUUID().replace(/-/g, ''); }, []);

  useEffect(() => {
    if (!ready || !items.length) return;
    const t = setTimeout(() => {
      startQuote(async () => {
        const q = await quoteAction({ items, countryCode: address.country_code, methodId, couponCode: appliedCoupon, email });
        setQuote(q);
        if (q.shipping.selectedId !== methodId) setMethodId(q.shipping.selectedId);
      });
    }, 250);
    return () => clearTimeout(t);
    // email affects per-customer coupon limits only; re-quote when it settles
  }, [ready, items, address.country_code, methodId, appliedCoupon, email]);

  const set = (k) => (e) => setAddress((a) => ({ ...a, [k]: e.target.value }));
  const setCountry = (code) => {
    const f = addressFormat(code);
    setAddress((a) => ({
      ...a,
      country_code: code,
      region: f.regionOptions && !f.regionOptions.includes(a.region) ? '' : a.region,
      phone: a.phone || (f.dialCode ? `+${f.dialCode} ` : ''),
    }));
    setMethodId(null);
  };

  if (!ready) return <p className="py-16 text-muted">Loading…</p>;
  if (!items.length) return <p className="py-16">Your bag is empty. <Link href="/shop" className="link">Continue shopping</Link></p>;

  const t = quote?.totals;
  const selected = quote?.shipping.options.find((o) => o.id === quote.shipping.selectedId);
  const requiresQuote = Boolean(selected?.requiresQuote);
  const shippingBlocked = quote && ['blocked', 'unavailable'].includes(quote.shipping.status);
  const blocking = !quote || quote.issues.length > 0 || shippingBlocked || !selected || (!requiresQuote && !quote.paymentsReady);
  const international = address.country_code !== 'NG';

  function submit(e) {
    e.preventDefault();
    setMessage(null);
    setErrors({});
    startPlace(async () => {
      const r = await placeOrderAction({
        items, email, address, methodId: quote?.shipping.selectedId, couponCode: appliedCoupon,
        delivery_instructions: instructions, chargeCurrency, idempotencyKey: idem.current,
      });
      if (r.ok) {
        window.location.assign(r.redirectTo);
        return;
      }
      setErrors(r.errors || {});
      setMessage({ text: r.message, trackPath: r.placed ? r.trackPath : null });
      if (r.code === 'stock' || r.code === 'cart_issues') idem.current = crypto.randomUUID().replace(/-/g, '');
    });
  }

  const err = (k) => errors[k] && <p className="error-text">{errors[k]}</p>;

  return (
    <form onSubmit={submit} className="grid gap-12 lg:grid-cols-12" noValidate>
      <div className="grid gap-10 lg:col-span-7">
        <section aria-labelledby="contact-h">
          <h2 id="contact-h" className="font-display text-2xl">Contact</h2>
          {!user && <p className="mt-1 text-sm text-muted">Checking out as a guest. <Link href="/login?next=/checkout" className="link">Sign in</Link> to use saved addresses.</p>}
          <div className="mt-5 field">
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} />
            <p className="hint">Order confirmation and updates go here.</p>
            {err('email')}
          </div>
        </section>

        <section aria-labelledby="addr-h">
          <h2 id="addr-h" className="font-display text-2xl">Delivery address</h2>
          {addresses.length > 0 && (
            <div className="mt-4 field">
              <label className="label" htmlFor="saved">Saved addresses</label>
              <select id="saved" className="input" defaultValue={def?.id || ''} onChange={(e) => {
                const a = addresses.find((x) => String(x.id) === e.target.value);
                setAddress(a ? pick(a) : { ...EMPTY, full_name: user?.name || '' });
                setMethodId(null);
              }}>
                {addresses.map((a) => <option key={a.id} value={a.id}>{a.label || a.line1}, {a.city}</option>)}
                <option value="">New address</option>
              </select>
            </div>
          )}
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <CountryCombobox key={address.country_code} countries={countries} value={address.country_code} onChange={setCountry} error={errors.country_code} />
            </div>
            <div className="field sm:col-span-2">
              <label className="label" htmlFor="full_name">Full name</label>
              <input id="full_name" autoComplete="name" className="input" value={address.full_name} onChange={set('full_name')} aria-invalid={Boolean(errors.full_name)} />
              {err('full_name')}
            </div>
            <div className="field sm:col-span-2">
              <label className="label" htmlFor="line1">Street address</label>
              <input id="line1" autoComplete="address-line1" className="input" value={address.line1} onChange={set('line1')} aria-invalid={Boolean(errors.line1)} />
              {err('line1')}
            </div>
            <div className="field sm:col-span-2">
              <label className="label" htmlFor="line2">Apartment, building, landmark (optional)</label>
              <input id="line2" autoComplete="address-line2" className="input" value={address.line2} onChange={set('line2')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="city">City / town</label>
              <input id="city" autoComplete="address-level2" className="input" value={address.city} onChange={set('city')} aria-invalid={Boolean(errors.city)} />
              {err('city')}
            </div>
            <div className="field">
              <label className="label" htmlFor="region">{fmt.regionLabel}{fmt.regionRequired ? '' : ' (optional)'}</label>
              {fmt.regionOptions ? (
                <select id="region" className="input" value={address.region} onChange={set('region')} aria-invalid={Boolean(errors.region)}>
                  <option value="">Choose…</option>
                  {fmt.regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <input id="region" autoComplete="address-level1" className="input" value={address.region} onChange={set('region')} aria-invalid={Boolean(errors.region)} />
              )}
              {err('region')}
            </div>
            {fmt.postal !== 'hidden' && (
              <div className="field">
                <label className="label" htmlFor="postal">{fmt.postalLabel}{fmt.postal === 'required' ? '' : ' (if applicable)'}</label>
                <input id="postal" autoComplete="postal-code" className="input" value={address.postal_code} onChange={set('postal_code')} aria-invalid={Boolean(errors.postal_code)} />
                {err('postal_code')}
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor="phone">Phone</label>
              <input id="phone" type="tel" autoComplete="tel" className="input" value={address.phone} onChange={set('phone')} aria-invalid={Boolean(errors.phone)} placeholder={fmt.dialCode ? `+${fmt.dialCode}` : '+ country code'} />
              <p className="hint">Include the country code. The courier may call this number.</p>
              {err('phone')}
            </div>
            <div className="field sm:col-span-2">
              <label className="label" htmlFor="instructions">Delivery instructions (optional)</label>
              <textarea id="instructions" maxLength={500} className="input" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </div>
          </div>
        </section>

        <section aria-labelledby="ship-h" aria-busy={quoting}>
          <h2 id="ship-h" className="font-display text-2xl">Delivery method</h2>
          {!quote ? (
            <p className="mt-4 text-muted">Checking delivery options…</p>
          ) : shippingBlocked ? (
            <p className="notice notice-error mt-4">We do not currently deliver to this country. <Link href="/contact" className="link">Contact us</Link> to ask about options.</p>
          ) : (
            <fieldset className="mt-4 grid gap-3">
              <legend className="sr-only">Choose a delivery method</legend>
              {quote.shipping.options.map((o) => (
                <label key={o.id} className={`flex cursor-pointer gap-4 border p-4 ${o.id === quote.shipping.selectedId ? 'border-burgundy bg-white' : 'border-line'}`}>
                  <input type="radio" name="method" className="mt-1 accent-burgundy" checked={o.id === quote.shipping.selectedId} onChange={() => setMethodId(o.id)} />
                  <span className="flex-1">
                    <span className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium">{o.name}</span>
                      <span>{o.requiresQuote ? 'Quoted after ordering' : o.rateKobo === 0 ? 'Free' : formatMoney(o.rateKobo)}</span>
                    </span>
                    {o.estimate && <span className="block text-sm text-muted">Estimated {o.estimate} after dispatch</span>}
                    {o.description && <span className="block text-sm text-muted">{o.description}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {requiresQuote && (
            <p className="notice mt-4">
              Delivery to this address needs a quotation. Place your order now and we will email the delivery cost and a payment link. Nothing is charged until you pay that link, and your items are held for you meanwhile.
            </p>
          )}
          {processingNote && <p className="mt-3 text-sm text-muted">{processingNote}</p>}
          {international && <p className="mt-4 text-sm text-muted">{customsNotice}</p>}
        </section>

        {quote?.usd.available && !requiresQuote && (
          <section aria-labelledby="cur-h">
            <h2 id="cur-h" className="font-display text-2xl">Payment currency</h2>
            <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Currency to be charged</legend>
              {[['NGN', t?.totalKobo ? formatMoney(t.totalKobo) : ''], ['USD', quote.usd.amountMinor ? formatMoney(quote.usd.amountMinor, 'USD') : '']].map(([c, amt]) => (
                <label key={c} className={`flex cursor-pointer items-center justify-between border p-4 ${chargeCurrency === c ? 'border-burgundy bg-white' : 'border-line'}`}>
                  <span><input type="radio" name="cc" className="mr-3 accent-burgundy" checked={chargeCurrency === c} onChange={() => setChargeCurrency(c)} />Pay in {c}</span>
                  <span>{amt}</span>
                </label>
              ))}
            </fieldset>
            <p className="mt-3 text-sm text-muted">The USD amount uses the exchange rate shown when you pay and is fixed once your order is placed. Your bank may apply its own conversion fees.</p>
          </section>
        )}
      </div>

      <aside className="lg:col-span-5">
        <div className="bg-ivory-deep p-6 lg:sticky lg:top-28">
          <h2 className="font-display text-2xl">Your order</h2>
          <ul className="mt-5 divide-y divide-line text-sm">
            {(quote?.lines || []).map((l) => (
              <li key={l.key} className="flex justify-between gap-4 py-3">
                <span>{l.name}{l.variantLabel ? `, ${l.variantLabel}` : ''} × {l.quantity}</span>
                <span className="shrink-0">{formatMoney(l.lineTotalKobo)}</span>
              </li>
            ))}
          </ul>
          {quote?.issues.length > 0 && (
            <div className="notice notice-error mt-4">
              {quote.issues.map((i) => <p key={i.key + i.type}>{i.message}</p>)}
              <Link href="/cart" className="link">Update your bag</Link>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <label htmlFor="coupon" className="sr-only">Discount code</label>
            <input id="coupon" className="input" placeholder="Discount code" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
            <button type="button" className="btn btn-outline btn-sm text-burgundy" onClick={() => setAppliedCoupon(coupon.trim())}>Apply</button>
          </div>
          {quote?.coupon && <p className={`mt-2 text-sm ${quote.coupon.ok ? 'text-ok' : 'text-danger'}`}>{quote.coupon.ok ? `${quote.coupon.code} applied.` : quote.coupon.reason}</p>}

          <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{quote ? formatMoney(quote.subtotalKobo) : '—'}</dd></div>
            {t?.discountKobo > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{formatMoney(t.discountKobo)}</dd></div>}
            <div className="flex justify-between"><dt>Delivery</dt><dd>{requiresQuote ? 'To be quoted' : t?.shippingKobo === null || t?.shippingKobo === undefined ? '—' : t.shippingKobo === 0 ? 'Free' : formatMoney(t.shippingKobo)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-base"><dt>Total</dt><dd>{requiresQuote ? `${formatMoney(t?.subtotalKobo - (t?.discountKobo || 0))} + delivery` : t?.totalKobo ? formatMoney(t.totalKobo) : '—'}</dd></div>
          </dl>
          {quote?.display?.approx && !requiresQuote && (
            <p className="mt-2 text-xs text-muted">{formatMoney(quote.display.approx.amountMinor, quote.display.approx.currency, { approx: true })} — indicative. You are charged in {chargeCurrency}.</p>
          )}

          {message && (
            <div className="notice notice-error mt-5" role="alert">
              <p>{message.text}</p>
              {message.trackPath && <p className="mt-2">Your order was saved. <Link className="link" href={message.trackPath}>View it and retry payment</Link>.</p>}
            </div>
          )}
          {quote && !quote.paymentsReady && !requiresQuote && (
            <p className="notice mt-5">Online payment is not available yet. Contact us on WhatsApp to complete your purchase.</p>
          )}

          <button className="btn btn-primary mt-6 w-full" disabled={blocking || placing || quoting}>
            {placing ? 'Placing order…' : requiresQuote ? 'Place order and request delivery quote' : `Pay ${chargeCurrency === 'USD' && quote?.usd.amountMinor ? formatMoney(quote.usd.amountMinor, 'USD') : t?.totalKobo ? formatMoney(t.totalKobo) : ''} with Paystack`}
          </button>
          <p className="mt-3 text-xs text-muted">
            {requiresQuote ? 'No payment is taken now.' : 'You will be taken to Paystack to pay securely. We never see or store your card details.'} By placing an order you agree to our <Link href="/terms" className="underline">terms</Link>.
          </p>
        </div>
      </aside>
    </form>
  );
}

function pick(a) {
  return {
    full_name: a.full_name, phone: a.phone, country_code: a.country_code, region: a.region || '', city: a.city,
    postal_code: a.postal_code || '', line1: a.line1, line2: a.line2 || '',
  };
}
