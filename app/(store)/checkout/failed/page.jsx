import Link from 'next/link';
import { getOrderByToken } from '@/db/queries/orders';
import { payOrderAction } from '@/app/actions/checkout';

export const metadata = { title: 'Payment not completed', robots: { index: false } };

const TEXT = {
  failed: 'The payment was declined or cancelled. You have not been charged.',
  pending: 'Your bank has not confirmed the payment yet. If money left your account, the order will update automatically once it is confirmed.',
  mismatch: 'The payment did not match your order, so we have not accepted it. Our team will contact you; nothing more is needed from you right now.',
  error: 'We could not reach the payment provider to confirm your payment. Refresh this page in a minute.',
  unknown: 'We could not find this payment.',
};

export default async function FailedPage({ searchParams }) {
  const sp = await searchParams;
  const found = await getOrderByToken(sp.order, sp.token);
  const canRetry = found?.order.status === 'pending_payment';
  return (
    <div className="wrap max-w-2xl pt-16">
      <h1 className="font-display text-title">Payment not completed</h1>
      <p className="mt-4">{TEXT[sp.status] || TEXT.unknown}</p>
      {found && <p className="mt-2 text-muted">Order {found.order.order_number}</p>}
      <div className="mt-10 flex flex-wrap gap-4">
        {canRetry && (
          <form action={payOrderAction}>
            <input type="hidden" name="order" value={found.order.order_number} />
            <input type="hidden" name="token" value={found.order.tracking_token} />
            <button className="btn btn-primary">Try paying again</button>
          </form>
        )}
        <Link href="/cart" className="btn btn-outline text-burgundy">Back to your bag</Link>
        <Link href="/contact" className="link self-center text-sm">Contact us</Link>
      </div>
    </div>
  );
}
