'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { formatMoney, indicativePrice } from '@/lib/currency';

const LOW_STOCK = 3;

export default function AddToBag({ product, currency, fx, whatsappHref }) {
  const { add } = useCart();
  const options = Array.isArray(product.options) ? product.options.filter((o) => o?.name && o.values?.length) : [];
  const variants = product.variants || [];
  const hasVariants = variants.length > 0;
  const custom = Array.isArray(product.customization_options) ? product.customization_options : [];

  const [selected, setSelected] = useState(() => {
    // Preselect the first in-stock variant's values so the price is meaningful straight away.
    const first = variants.find((v) => !product.track_inventory || v.stock > 0) || variants[0];
    return first ? { ...first.option_values } : {};
  });
  const [qty, setQty] = useState(1);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [added, setAdded] = useState(false);

  const variant = useMemo(
    () => (hasVariants ? variants.find((v) => options.every((o) => v.option_values?.[o.name] === selected[o.name])) || null : null),
    [hasVariants, variants, options, selected]
  );
  const price = variant?.price_kobo ?? product.price_kobo;
  const compare = variant?.compare_at_kobo ?? product.compare_at_kobo;
  const showCompare = compare && compare > price;
  const stock = product.track_inventory ? (hasVariants ? variant?.stock ?? 0 : product.stock) : null;
  const unavailable = hasVariants && !variant;
  const soldOut = stock !== null && stock <= 0;
  const approx = indicativePrice(price, currency, fx);

  const isValueAvailable = (optName, value) => {
    const candidate = { ...selected, [optName]: value };
    return variants.some(
      (v) => options.every((o) => o.name === optName || v.option_values?.[o.name] === candidate[o.name]) && v.option_values?.[optName] === value && (!product.track_inventory || v.stock > 0)
    );
  };

  function submit(e) {
    e.preventDefault();
    const errs = {};
    for (const c of custom) {
      const v = (values[c.key] || '').trim();
      if (c.required && !v) errs[c.key] = `${c.label} is required.`;
      if (v && c.max_length && v.length > c.max_length) errs[c.key] = `Keep it to ${c.max_length} characters.`;
    }
    setErrors(errs);
    if (Object.keys(errs).length || unavailable || soldOut) return;
    const cleanValues = Object.fromEntries(Object.entries(values).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v.trim()]));
    add({ productId: product.id, variantId: variant?.id ?? null, quantity: qty, customizations: cleanValues });
    setAdded(true);
  }

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      <div>
        <p className="flex flex-wrap items-baseline gap-x-3 text-2xl">
          {formatMoney(price, 'NGN')}
          {showCompare && <s className="text-base text-muted">{formatMoney(compare, 'NGN')}</s>}
        </p>
        {approx && (
          <p className="mt-1 text-sm text-muted">
            {formatMoney(approx.amountMinor, approx.currency, { approx: true })} — indicative only. You are charged in NGN unless another currency is offered at checkout.
          </p>
        )}
      </div>

      {options.map((o) => (
        <fieldset key={o.name}>
          <legend className="label mb-2">{o.name}: <span className="font-normal text-muted">{selected[o.name] || 'Choose'}</span></legend>
          <div className="flex flex-wrap gap-2">
            {o.values.map((val) => {
              const on = selected[o.name] === val;
              const avail = isValueAvailable(o.name, val);
              return (
                <label key={val} className={`cursor-pointer border px-4 py-2 text-sm ${on ? 'border-burgundy bg-burgundy text-ivory' : 'border-line bg-white hover:border-charcoal'} ${!avail && !on ? 'text-muted line-through' : ''}`}>
                  <input type="radio" name={`opt-${o.name}`} value={val} checked={on} onChange={() => { setSelected((s) => ({ ...s, [o.name]: val })); setAdded(false); }} className="sr-only" />
                  {val}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {custom.map((c) => (
        <div key={c.key} className="field">
          <label className="label" htmlFor={`c-${c.key}`}>{c.label}{c.required ? '' : ' (optional)'}</label>
          {c.type === 'select' ? (
            <select id={`c-${c.key}`} className="input" value={values[c.key] || ''} onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))} aria-invalid={Boolean(errors[c.key])}>
              <option value="">Choose…</option>
              {(c.choices || []).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          ) : (
            <input id={`c-${c.key}`} className="input" maxLength={c.max_length || 200} value={values[c.key] || ''} onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))} aria-invalid={Boolean(errors[c.key])} />
          )}
          {errors[c.key] && <p className="error-text">{errors[c.key]}</p>}
        </div>
      ))}

      <div className="flex flex-wrap items-end gap-4">
        <div className="field w-28">
          <label className="label" htmlFor="qty">Quantity</label>
          <input id="qty" type="number" min={1} max={Math.min(50, stock ?? 50) || 1} value={qty} className="input"
            onChange={(e) => setQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
        </div>
        <button className="btn btn-primary flex-1" disabled={unavailable || soldOut}>
          {unavailable ? 'Choose an option' : soldOut ? 'Sold out' : 'Add to bag'}
        </button>
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {soldOut ? 'This option is sold out.' : stock !== null && stock <= LOW_STOCK ? `Only ${stock} left.` : stock !== null ? 'In stock.' : 'Available to order.'}
        {stock !== null && qty > stock && stock > 0 && ` Only ${stock} available.`}
      </p>
      {added && (
        <p role="status" className="notice notice-ok">
          Added to your bag. <Link href="/cart" className="link">View bag</Link>
        </p>
      )}
      {whatsappHref && (
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn btn-outline text-burgundy">
          Ask about this piece on WhatsApp
        </a>
      )}
    </form>
  );
}
