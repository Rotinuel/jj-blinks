'use client';

import { useActionState, useMemo, useState } from 'react';
import { createRequestAction } from '@/app/actions/requests';
import { listCountries } from '@/lib/countries';
import CountryCombobox from '@/components/checkout/CountryCombobox';
import Uploader from '@/components/ui/Uploader';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const APPAREL = ['Branded T-Shirts', 'Branded Polos'];

export default function RequestForm({ kind, productTypes, defaultProduct }) {
  const [state, action, pending] = useActionState(createRequestAction, null);
  const countries = useMemo(() => listCountries(), []);
  const [country, setCountry] = useState('NG');
  const [product, setProduct] = useState(defaultProduct || '');
  const [refs, setRefs] = useState([]);
  const [logos, setLogos] = useState([]);
  const [showApparel, setShowApparel] = useState(false);
  const apparel = APPAREL.includes(product) || showApparel;
  const e = state?.errors || {};
  const Err = ({ k }) => (e[k] ? <p className="error-text">{e[k]}</p> : null);
  const bulk = kind === 'bulk';

  return (
    <form action={action} className="grid gap-6 sm:grid-cols-2" noValidate>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="country_code" value={country} />
      <input type="hidden" name="reference_ids" value={refs.map((r) => r.id).join(',')} />
      <input type="hidden" name="logo_ids" value={logos.map((r) => r.id).join(',')} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <fieldset className="grid gap-6 sm:col-span-2 sm:grid-cols-2">
        <legend className="mb-4 font-display text-2xl">{bulk ? 'Your organisation' : 'About you'}</legend>
        {bulk && (
          <div className="field sm:col-span-2">
            <label className="label" htmlFor="company">Organisation or group</label>
            <input id="company" name="company" className="input" aria-invalid={Boolean(e.company)} />
            <Err k="company" />
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="name">{bulk ? 'Contact name' : 'Full name'}</label>
          <input id="name" name="name" autoComplete="name" className="input" aria-invalid={Boolean(e.name)} />
          <Err k="name" />
        </div>
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" className="input" aria-invalid={Boolean(e.email)} />
          <Err k="email" />
        </div>
        <div className="field">
          <label className="label" htmlFor="phone">Phone or WhatsApp number</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+234…" className="input" aria-invalid={Boolean(e.phone)} />
          <Err k="phone" />
        </div>
        <CountryCombobox key={country} countries={countries} value={country} onChange={setCountry} error={e.country_code} label="Delivery country" />
      </fieldset>

      <fieldset className="grid gap-6 sm:col-span-2 sm:grid-cols-2">
        <legend className="mb-4 font-display text-2xl">The {bulk ? 'order' : 'piece'}</legend>
        <div className="field">
          <label className="label" htmlFor="product_type">Product</label>
          <select id="product_type" name="product_type" className="input" value={product} onChange={(ev) => setProduct(ev.target.value)} aria-invalid={Boolean(e.product_type)}>
            <option value="">Choose…</option>
            {productTypes.map((p) => <option key={p}>{p}</option>)}
            <option>Something else</option>
          </select>
          <Err k="product_type" />
        </div>
        <div className="field">
          <label className="label" htmlFor="quantity">{bulk ? 'Estimated quantity' : 'Quantity'}</label>
          <input id="quantity" name="quantity" type="number" min={1} defaultValue={bulk ? '' : 1} className="input" aria-invalid={Boolean(e.quantity)} />
          <Err k="quantity" />
        </div>
        <div className="field">
          <label className="label" htmlFor="occasion">Occasion (optional)</label>
          <input id="occasion" name="occasion" placeholder={bulk ? 'Staff uniform, launch, wedding party…' : 'Wedding, birthday, owambe…'} className="input" />
        </div>
        <div className="field">
          <label className="label" htmlFor="desired_date">Date needed (optional)</label>
          <input id="desired_date" name="desired_date" type="date" className="input" aria-invalid={Boolean(e.desired_date)} />
          <Err k="desired_date" />
        </div>
        <div className="field sm:col-span-2">
          <label className="label" htmlFor="style_description">{bulk ? 'Customisation details' : 'Describe the style'}</label>
          <textarea id="style_description" name="style_description" className="input" placeholder="Shape, fabric, finish, embellishment, how you want it to look…" aria-invalid={Boolean(e.style_description)} />
          <Err k="style_description" />
        </div>
        <div className="field">
          <label className="label" htmlFor="colours">Colours (optional)</label>
          <input id="colours" name="colours" className="input" placeholder="e.g. wine and gold" />
        </div>
        <div className="field">
          <label className="label" htmlFor="budget">Budget in naira (optional)</label>
          <input id="budget" name="budget" inputMode="decimal" className="input" aria-invalid={Boolean(e.budget)} />
          <Err k="budget" />
        </div>
        <div className="sm:col-span-2">
          <Uploader purpose="custom_reference" label="Reference photos (optional)" hint="Outfit, fabric or inspiration. JPG, PNG or WebP, up to 5." value={refs} onChange={setRefs} />
        </div>
      </fieldset>

      {!APPAREL.includes(product) && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="accent-burgundy" checked={showApparel} onChange={(ev) => setShowApparel(ev.target.checked)} />
          This includes branded T-shirts or polos
        </label>
      )}

      {apparel && (
        <fieldset className="grid gap-6 border-t border-line pt-8 sm:col-span-2 sm:grid-cols-2">
          <legend className="mb-4 font-display text-2xl">Branded apparel</legend>
          <div className="field">
            <label className="label" htmlFor="garment_type">Garment</label>
            <input id="garment_type" name="garment_type" defaultValue={product === 'Branded Polos' ? 'Polo' : product === 'Branded T-Shirts' ? 'T-shirt' : ''} className="input" />
          </div>
          <div className="field">
            <label className="label" htmlFor="garment_colour">Garment colour</label>
            <input id="garment_colour" name="garment_colour" className="input" />
          </div>
          <div className="sm:col-span-2">
            <p className="label">Sizes and quantities</p>
            <div className="mt-2 grid grid-cols-4 gap-3 sm:grid-cols-7">
              {SIZES.map((s) => (
                <div key={s} className="field">
                  <label className="hint" htmlFor={`size_${s}`}>{s}</label>
                  <input id={`size_${s}`} name={`size_${s}`} type="number" min={0} className="input" />
                </div>
              ))}
            </div>
          </div>
          <div className="field sm:col-span-2">
            <label className="label" htmlFor="branding">Branding requirements</label>
            <textarea id="branding" name="branding" className="input" placeholder="Logo position and size, print or embroidery, text…" />
          </div>
          <div className="sm:col-span-2">
            <Uploader purpose="logo" label="Logo files (optional)" hint="PNG, JPG, WebP or PDF. Vector PDFs print best." accept="image/jpeg,image/png,image/webp,application/pdf" max={3} value={logos} onChange={setLogos} />
          </div>
        </fieldset>
      )}

      {bulk && (
        <div className="field sm:col-span-2">
          <label className="label" htmlFor="notes">Anything else (optional)</label>
          <textarea id="notes" name="notes" className="input" placeholder="Delivery points, invoicing details, who else to copy in…" />
        </div>
      )}

      <div className="sm:col-span-2">
        {state?.message && <p className="error-text mb-4" role="alert">{state.message}</p>}
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Sending…' : bulk ? 'Request a bulk quotation' : 'Send my request'}</button>
        <p className="mt-3 text-sm text-muted">Nothing is charged now. We reply with a quotation, and you pay only if you accept it.</p>
      </div>
    </form>
  );
}
