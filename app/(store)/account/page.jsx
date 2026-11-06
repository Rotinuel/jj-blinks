import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listOrdersForUser } from '@/db/queries/orders';
import { ORDER_STATUS_LABELS } from '@/lib/orders';
import { formatMoney } from '@/lib/currency';
import { formatDate } from '@/lib/utilities';

export const metadata = { title: 'Your account' };

export default async function AccountPage() {
  const user = await requireUser('/account');
  const orders = await listOrdersForUser(user.id, 3);
  return (
    <>
      <h1 className="font-display text-title">Your account</h1>
      <section className="mt-10">
        <div className="flex items-end justify-between"><h2 className="font-display text-2xl">Recent orders</h2><Link href="/account/orders" className="link text-sm">All orders</Link></div>
        {orders.length ? (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {orders.map((o) => (
              <li key={o.id}><Link href={`/account/orders/${o.order_number}`} className="flex flex-wrap justify-between gap-3 py-4 hover:text-wine">
                <span>{o.order_number} <span className="text-sm text-muted">· {formatDate(o.created_at)}</span></span>
                <span className="text-sm">{ORDER_STATUS_LABELS[o.status]} · {o.total_kobo === null ? 'Awaiting quote' : formatMoney(o.total_kobo)}</span>
              </Link></li>
            ))}
          </ul>
        ) : <p className="mt-4 text-muted">No orders yet. <Link href="/shop" className="link">Start shopping</Link>.</p>}
      </section>
      <p className="mt-10 text-sm text-muted">Orders placed as a guest are not linked to your account. Use <Link href="/track" className="link">order tracking</Link> for those.</p>
    </>
  );
}
