import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/account/AuthForms';
import SocialButtons from '@/components/account/SocialButtons';
import { getCurrentUser, safeNext } from '@/lib/auth';

export const metadata = { title: 'Create an account', robots: { index: false } };

export default async function RegisterPage({ searchParams }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, '/account');
  if (await getCurrentUser()) redirect(next);
  return (
    <>
      <div className="md:col-span-5">
        <h1 className="font-display text-title">Create an account</h1>
        <p className="mt-4 text-muted">Save addresses for faster checkout, follow your orders and keep a wishlist.</p>
        <p className="mt-6 text-sm">Already registered? <Link href={`/login?next=${encodeURIComponent(next)}`} className="link">Sign in</Link></p>
      </div>
      <div className="md:col-span-5 md:col-start-8"><SocialButtons next={next} /><RegisterForm next={next} /></div>
    </>
  );
}
