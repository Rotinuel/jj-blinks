import Link from 'next/link';
import { ResetForm } from '@/components/account/AuthForms';

export const metadata = { title: 'Choose a new password', robots: { index: false } };

export default async function ResetPage({ searchParams }) {
  const { token } = await searchParams;
  return (
    <>
      <div className="md:col-span-5">
        <h1 className="font-display text-title">Choose a new password</h1>
        <p className="mt-4 text-muted">Changing your password signs you out everywhere.</p>
      </div>
      <div className="md:col-span-5 md:col-start-8">
        {token ? <ResetForm token={String(token)} /> : <p>This link is incomplete. <Link href="/forgot-password" className="link">Request a new one</Link>.</p>}
      </div>
    </>
  );
}
