import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/account/AuthForms';
import { getCurrentUser, safeNext } from '@/lib/auth';
import { isStaff } from '@/lib/permissions';

export const metadata = { title: 'Staff sign in', robots: { index: false } };

export default async function AdminLogin({ searchParams }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, '/admin');
  const user = await getCurrentUser();
  if (user && isStaff(user.role)) redirect(next);
  return (
    <main className="grid min-h-dvh md:grid-cols-2">
      <div className="hidden bg-burgundy p-12 text-ivory md:flex md:flex-col md:justify-between">
        <p className="font-display text-3xl tracking-[0.24em]">JJ BLINKS</p>
        <p className="max-w-sm font-display text-4xl leading-tight">Store administration</p>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl">Staff sign in</h1>
          {user && !isStaff(user.role) && <p className="notice notice-error mt-4">This account does not have staff access.</p>}
          <div className="mt-8"><LoginForm next={next} admin /></div>
        </div>
      </div>
    </main>
  );
}
