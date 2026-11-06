'use client';

import { useActionState } from 'react';
import { subscribeAction } from '@/app/actions/store';

export default function NewsletterForm() {
  const [state, action, pending] = useActionState(subscribeAction, null);
  return (
    <form action={action} className="grid gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="nl-email" className="sr-only">Email address</label>
        <input id="nl-email" name="email" type="email" required autoComplete="email" placeholder="Email address"
          className="min-h-12 flex-1 rounded-full border border-ivory/30 bg-white/5 px-5 text-ivory placeholder:text-ivory/50 focus:border-gold focus:outline-none" />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <button className="btn btn-light" disabled={pending}>{pending ? 'Subscribing…' : 'Subscribe'}</button>
      </div>
      <label className="flex items-start gap-2 text-xs text-ivory/65">
        <input type="checkbox" name="consent" required className="mt-0.5 accent-gold" />
        I agree to receive occasional emails from JJ BLINKS.
      </label>
      {state && <p role="status" className={`text-sm ${state.ok ? 'text-gold' : 'text-rose'}`}>{state.message}</p>}
    </form>
  );
}
