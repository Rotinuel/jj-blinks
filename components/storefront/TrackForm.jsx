'use client';

import { useActionState } from 'react';
import { trackLookupAction } from '@/app/actions/orders';

export default function TrackForm() {
  const [state, action, pending] = useActionState(trackLookupAction, null);
  return (
    <form action={action} className="grid gap-5">
      <div className="field">
        <label className="label" htmlFor="order">Order number</label>
        <input id="order" name="order" required placeholder="JJB-261104-ABCDE" className="input uppercase" autoComplete="off" />
      </div>
      <div className="field">
        <label className="label" htmlFor="email">Email used for the order</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      {state?.message && <p className="error-text" role="alert">{state.message}</p>}
      <button className="btn btn-primary justify-self-start" disabled={pending}>{pending ? 'Finding…' : 'Find my order'}</button>
    </form>
  );
}
