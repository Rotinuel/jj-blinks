'use client';

import { useActionState, useMemo, useState } from 'react';
import { changePasswordAction, saveAddressAction, updateDetailsAction } from '@/app/actions/account';
import { addressFormat, listCountries } from '@/lib/countries';
import CountryCombobox from '@/components/checkout/CountryCombobox';
import PasswordInput from '@/components/ui/PasswordInput';

const Err = ({ e }) => (e ? <p className="error-text">{e}</p> : null);

export function DetailsForm({ user }) {
  const [state, action, pending] = useActionState(updateDetailsAction, null);
  const e = state?.errors || {};
  return (
    <form action={action} className="grid gap-5">
      <div className="field">
        <label className="label" htmlFor="name">Full name</label>
        <input id="name" name="name" defaultValue={user.name} required className="input" />
        <Err e={e.name} />
      </div>
      <div className="field">
        <label className="label" htmlFor="phone">Phone</label>
        <input id="phone" name="phone" type="tel" defaultValue={user.phone || ''} className="input" />
        <Err e={e.phone} />
      </div>
      <p className="text-sm text-muted">Email: {user.email}</p>
      {state?.message && <p className={state.ok ? 'text-sm text-ok' : 'error-text'} role="status">{state.message}</p>}
      <button className="btn btn-primary justify-self-start" disabled={pending}>Save details</button>
    </form>
  );
}

export function PasswordForm({ hasPassword = true }) {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const e = state?.errors || {};
  if (state?.ok) return <p className="notice notice-ok" role="status">{state.message}</p>;
  return (
    <form action={action} className="grid gap-5">
      {hasPassword ? (
        <div className="field">
          <label className="label" htmlFor="current_password">Current password</label>
          <PasswordInput id="current_password" name="current_password" autoComplete="current-password" required />
          <Err e={e.current_password} />
        </div>
      ) : (
        <p className="text-sm text-muted">You sign in with Google or Facebook. Set a password to also sign in with your email or phone number.</p>
      )}
      <div className="field">
        <label className="label" htmlFor="new_password">{hasPassword ? 'New password' : 'Password'}</label>
        <PasswordInput id="new_password" name="new_password" autoComplete="new-password" required />
        <p className="hint">At least 10 characters, with a letter and a number.</p>
        <Err e={e.new_password} />
      </div>
      <div className="field">
        <label className="label" htmlFor="confirm_password">Confirm {hasPassword ? 'new ' : ''}password</label>
        <PasswordInput id="confirm_password" name="confirm_password" autoComplete="new-password" required />
        <Err e={e.confirm_password} />
      </div>
      {state?.message && <p className="error-text">{state.message}</p>}
      <button className="btn btn-outline justify-self-start text-burgundy" disabled={pending}>{hasPassword ? 'Change password' : 'Set password'}</button>
      {hasPassword && <p className="hint">Changing your password signs you out on every device.</p>}
    </form>
  );
}

export function AddressForm() {
  const [state, action, pending] = useActionState(saveAddressAction, null);
  const countries = useMemo(() => listCountries(), []);
  const [country, setCountry] = useState('NG');
  const fmt = addressFormat(country);
  const e = state?.errors || {};
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="country_code" value={country} />
      <div className="sm:col-span-2"><CountryCombobox key={country} countries={countries} value={country} onChange={setCountry} error={e.country_code} /></div>
      <div className="field"><label className="label" htmlFor="label">Label (optional)</label><input id="label" name="label" placeholder="Home, Office…" className="input" /></div>
      <div className="field"><label className="label" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" className="input" /><Err e={e.full_name} /></div>
      <div className="field sm:col-span-2"><label className="label" htmlFor="line1">Street address</label><input id="line1" name="line1" className="input" /><Err e={e.line1} /></div>
      <div className="field sm:col-span-2"><label className="label" htmlFor="line2">Apartment, landmark (optional)</label><input id="line2" name="line2" className="input" /></div>
      <div className="field"><label className="label" htmlFor="city">City / town</label><input id="city" name="city" className="input" /><Err e={e.city} /></div>
      <div className="field">
        <label className="label" htmlFor="region">{fmt.regionLabel}</label>
        {fmt.regionOptions ? (
          <select id="region" name="region" className="input" defaultValue=""><option value="">Choose…</option>{fmt.regionOptions.map((r) => <option key={r}>{r}</option>)}</select>
        ) : <input id="region" name="region" className="input" />}
        <Err e={e.region} />
      </div>
      {fmt.postal !== 'hidden' && <div className="field"><label className="label" htmlFor="postal_code">{fmt.postalLabel}</label><input id="postal_code" name="postal_code" className="input" /><Err e={e.postal_code} /></div>}
      <div className="field"><label className="label" htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" className="input" placeholder={fmt.dialCode ? `+${fmt.dialCode}` : '+'} /><Err e={e.phone} /></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="is_default" className="accent-burgundy" /> Use as my default address</label>
      {state?.message && <p className={`sm:col-span-2 ${state.ok ? 'text-sm text-ok' : 'error-text'}`} role="status">{state.message}</p>}
      <button className="btn btn-primary justify-self-start" disabled={pending}>Save address</button>
    </form>
  );
}
