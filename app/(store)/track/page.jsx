import Link from 'next/link';
import TrackForm from '@/components/storefront/TrackForm';

export const metadata = { title: 'Track your order', alternates: { canonical: '/track' } };

export default async function TrackPage({ searchParams }) {
  const sp = await searchParams;
  return (
    <div className="wrap grid gap-12 pt-16 md:grid-cols-12">
      <div className="md:col-span-5">
        <h1 className="font-display text-title">Track your order</h1>
        <p className="mt-4 text-muted">Enter the order number from your confirmation and the email you used at checkout.</p>
        <p className="mt-4 text-sm">Have an account? <Link href="/account/orders" className="link">See all your orders</Link>.</p>
      </div>
      <div className="md:col-span-6 md:col-start-7">
        {sp.error === 'notfound' && <p className="notice notice-error mb-6">That order link is not valid. Look it up below.</p>}
        <TrackForm />
      </div>
    </div>
  );
}
