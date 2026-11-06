'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction, adminLoginAction } from '@/app/actions/auth';
import PasswordInput from '@/components/ui/PasswordInput';

function Err({ e }) {
  return e ? <p className="error-text">{e}</p> : null;
}

export function LoginForm({ next, admin = false }) {
  const [state, action, pending] = useActionState(admin ? adminLoginAction : loginAction, null);
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="next" value={next || ''} />
      <div className="field">
        <label className="label" htmlFor="identifier">Email or phone number</label>
        <input id="identifier" name="identifier" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
          required className="input" defaultValue={state?.identifier || ''} />
        <p className="hint">Phone numbers without a country code are read as Nigerian (e.g. 0803…).</p>
      </div>
      <div className="field">
        <label className="label" htmlFor="password">Password</label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </div>
      {state?.message && <p className="error-text" role="alert">{state.message}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      {!admin && <Link href="/forgot-password" className="link text-sm">Forgot your password?</Link>}
    </form>
  );
}

export function RegisterForm({ next }) {
  const [state, action, pending] = useActionState(registerAction, null);
  const e = state?.errors || {};
  return (
    <form action={action} className="grid gap-5" noValidate>
      <input type="hidden" name="next" value={next || ''} />
      <div className="field">
        <label className="label" htmlFor="name">Full name</label>
        <input id="name" name="name" autoComplete="name" required className="input" defaultValue={state?.values?.name || ''} aria-invalid={Boolean(e.name)} />
        <Err e={e.name} />
      </div>
      <div className="field">
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" defaultValue={state?.values?.email || ''} aria-invalid={Boolean(e.email)} />
        <p className="hint">For order confirmations and password resets.</p>
        <Err e={e.email} />
      </div>
      <div className="field">
        <label className="label" htmlFor="phone">Phone (optional)</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" className="input" placeholder="+234…" defaultValue={state?.values?.phone || ''} aria-invalid={Boolean(e.phone)} />
        <p className="hint">Add it to sign in with your phone number as well as your email.</p>
        <Err e={e.phone} />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">Password</label>
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={10} aria-invalid={Boolean(e.password)} />
        <p className="hint">At least 10 characters, with a letter and a number.</p>
        <Err e={e.password} />
      </div>
      {state?.message && !Object.keys(e).length && <p className="error-text" role="alert">{state.message}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</button>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);
  if (state?.ok) return <p className="notice notice-ok" role="status">{state.message}</p>;
  return (
    <form action={action} className="grid gap-5">
      <div className="field">
        <label className="label" htmlFor="identifier">Email or phone number</label>
        <input id="identifier" name="identifier" type="text" autoComplete="username" autoCapitalize="none" required className="input" />
        <p className="hint">We send the reset link to the email address on your account.</p>
      </div>
      {state?.message && <p className="error-text" role="alert">{state.message}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Sending…' : 'Send reset link'}</button>
    </form>
  );
}

export function ResetForm({ token }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label className="label" htmlFor="password">New password</label>
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={10} />
        <p className="hint">At least 10 characters, with a letter and a number.</p>
      </div>
      <div className="field">
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </div>
      {state?.message && <p className="error-text" role="alert">{state.message}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Set new password'}</button>
    </form>
  );
}
