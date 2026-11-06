'use client';

import { useActionState } from 'react';
import { contactAction } from '@/app/actions/store';

export default function ContactForm() {
  const [state, action, pending] = useActionState(contactAction, null);
  if (state?.ok) return <p className="notice notice-ok" role="status">{state.message}</p>;
  const e = state?.errors || {};
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="field"><label className="label" htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" className="input" aria-invalid={Boolean(e.name)} />{e.name && <p className="error-text">{e.name}</p>}</div>
      <div className="field"><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" className="input" aria-invalid={Boolean(e.email)} />{e.email && <p className="error-text">{e.email}</p>}</div>
      <div className="field"><label className="label" htmlFor="phone">Phone (optional)</label><input id="phone" name="phone" type="tel" className="input" /></div>
      <div className="field"><label className="label" htmlFor="subject">Subject (optional)</label><input id="subject" name="subject" className="input" /></div>
      <div className="field sm:col-span-2"><label className="label" htmlFor="message">Message</label><textarea id="message" name="message" className="input" aria-invalid={Boolean(e.message)} />{e.message && <p className="error-text">{e.message}</p>}</div>
      {state?.message && <p className="error-text sm:col-span-2" role="alert">{state.message}</p>}
      <button className="btn btn-primary justify-self-start" disabled={pending}>{pending ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}
