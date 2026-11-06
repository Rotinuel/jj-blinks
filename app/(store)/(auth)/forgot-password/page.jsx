import { ForgotForm } from '@/components/account/AuthForms';

export const metadata = { title: 'Reset your password', robots: { index: false } };

export default function ForgotPage() {
  return (
    <>
      <div className="md:col-span-5">
        <h1 className="font-display text-title">Reset your password</h1>
        <p className="mt-4 text-muted">Enter the email for your account and we will send a link to choose a new password.</p>
      </div>
      <div className="md:col-span-5 md:col-start-8"><ForgotForm /></div>
    </>
  );
}
