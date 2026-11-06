import { requireUser } from '@/lib/auth';
import { signInMethods } from '@/lib/session';
import { configuredProviders, PROVIDERS } from '@/lib/oauth';
import { formatDate } from '@/lib/utilities';
import { unlinkIdentityAction } from '@/app/actions/account';
import { DetailsForm, PasswordForm } from '@/components/account/AccountForms';
import { socialErrorMessage } from '@/components/account/authMessages';

export const metadata = { title: 'Details & password' };

export default async function DetailsPage({ searchParams }) {
  const user = await requireUser('/account/details');
  const sp = await searchParams;
  const methods = await signInMethods(user.id);
  const available = configuredProviders();
  const linked = new Map(methods.identities.map((i) => [i.provider, i]));
  const providers = [...new Set([...available.map((p) => p.id), ...linked.keys()])];
  const name = PROVIDERS[sp.provider]?.label;
  const ok = sp.ok === 'linked' ? `${name} is now connected.` : sp.ok === 'unlinked' ? `${name} has been disconnected.` : null;
  const error = sp.error === 'last_method' ? 'Set a password before disconnecting your only sign-in method.' : socialErrorMessage(sp.error, sp.provider);
  return (
    <>
      <h1 className="font-display text-title">Details & password</h1>
      {ok && <p className="notice notice-ok mt-6" role="status">{ok}</p>}
      {error && <p className="notice notice-error mt-6" role="alert">{error}</p>}
      <div className="mt-10 grid max-w-3xl gap-14 md:grid-cols-2">
        <section><h2 className="mb-6 font-display text-2xl">Your details</h2><DetailsForm user={{ name: user.name, phone: user.phone, email: user.email }} /></section>
        <section><h2 className="mb-6 font-display text-2xl">{methods.hasPassword ? 'Password' : 'Set a password'}</h2><PasswordForm hasPassword={methods.hasPassword} /></section>
      </div>
      <section className="mt-14 max-w-3xl">
        <h2 className="font-display text-2xl">Ways to sign in</h2>
        <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
          <li className="flex flex-wrap justify-between gap-3 py-4">
            <span>Email and password</span>
            <span className="text-muted">{methods.hasPassword ? user.email : 'No password set'}</span>
          </li>
          <li className="flex flex-wrap justify-between gap-3 py-4">
            <span>Phone number and password</span>
            <span className="text-muted">{methods.phone && methods.hasPassword ? methods.phone : methods.phone ? 'Set a password to use it' : 'Add a phone number above'}</span>
          </li>
          {providers.map((p) => {
            const id = linked.get(p);
            return (
              <li key={p} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <span>{PROVIDERS[p].label}{id?.email && <span className="text-muted"> — {id.email}</span>}</span>
                {id ? (
                  <form action={unlinkIdentityAction} className="flex items-center gap-4">
                    <span className="text-muted">Connected {formatDate(id.created_at)}</span>
                    <input type="hidden" name="provider" value={p} />
                    <button className="link">Disconnect</button>
                  </form>
                ) : available.some((a) => a.id === p) ? (
                  <a className="link" href={`/api/auth/${p}/start?mode=link&next=/account/details`}>Connect</a>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
