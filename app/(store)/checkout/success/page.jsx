import Link from 'next/link';
import { getOrderByToken } from '@/db/queries/orders';
import { emailConfigured } from '@/lib/email';
import { formatMoney } from '@/lib/currency';
import ClearCart from '@/components/cart/ClearCart';

export const metadata = { title: 'Thank you', robots: { index: false } };

export default async function SuccessPage({ searchParams }) {
  const sp = await searchParams;
  const found = await getOrderByToken(sp.order, sp.token);
  const paid = found && found.order.payment_status === 'paid';
  return (
    <div className="wrap max-w-3xl pt-16">
      {paid && <ClearCart />}
      <h1 className="font-display text-title">{paid ? 'Thank you. Your payment is confirmed.' : 'We are checking your payment.'}</h1>
      {found ? (
        <>
          <p className="mt-4 text-lg">Order <strong>{found.order.order_number}</strong></p>
          <p className="mt-2 text-muted">
            {paid
              ? emailConfigured()
                ? `A confirmation has been sent to ${found.order.email}.`
                : 'Keep this page’s link to follow your order.'
              : 'If you completed payment, this page will update shortly. Refresh in a minute.'}
          </p>
          <ul className="mt-8 divide-y divide-line border-y border-line text-sm">
            {found.items.map((i) => (
              <li key={i.id} className="flex justify-between py-3"><span>{i.name}{i.variant_label ? `, ${i.variant_label}` : ''} × {i.quantity}</span><span>{formatMoney(i.line_total_kobo)}</span></li>
            ))}
          </ul>
          <p className="mt-4 text-right">Total {formatMoney(found.order.charge_amount_minor ?? found.order.total_kobo, found.order.charge_currency)}</p>
          <Link className="btn btn-primary mt-10" href={`/track/${encodeURIComponent(found.order.order_number)}?token=${encodeURIComponent(found.order.tracking_token)}`}>Follow your order</Link>
        </>
      ) : (
        <p className="mt-4 text-muted">Use <Link href="/track" className="link">order tracking</Link> with your order number and email.</p>
      )}
    </div>
  );
}
