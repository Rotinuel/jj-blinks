import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/account/AuthForms';
import SocialButtons from '@/components/account/SocialButtons';
import { socialErrorMessage } from '@/components/account/authMessages';
import { getCurrentUser, safeNext } from '@/lib/auth';

export const metadata = { title: 'Sign in', robots: { index: false } };

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, '/account');
  if (await getCurrentUser()) redirect(next);
  return (
    <>
      <div className="md:col-span-5">
        <h1 className="font-display text-title">Sign in</h1>
        <p className="mt-4 text-muted">See your orders, saved addresses and wishlist. You do not need an account to buy.</p>
        <p className="mt-6 text-sm">New here? <Link href={`/register?next=${encodeURIComponent(next)}`} className="link">Create an account</Link></p>
      </div>
      <div className="md:col-span-5 md:col-start-8">
        {sp.reset && <p className="notice notice-ok mb-6">Password updated. Sign in with your new password.</p>}
        {sp.changed && <p className="notice notice-ok mb-6">Password changed. Sign in again on this device.</p>}
        {socialErrorMessage(sp.error, sp.provider) && <p className="notice notice-error mb-6" role="alert">{socialErrorMessage(sp.error, sp.provider)}</p>}
        <SocialButtons next={next} />
        <LoginForm next={next} />
      </div>
    </>
  );
}
