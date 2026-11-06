import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listOrdersForUser } from '@/db/queries/orders';
import { ORDER_STATUS_LABELS } from '@/lib/orders';
import { formatMoney } from '@/lib/currency';
import { formatDate } from '@/lib/utilities';

export const metadata = { title: 'Your orders' };

export default async function OrdersPage() {
  const user = await requireUser('/account/orders');
  const orders = await listOrdersForUser(user.id);
  return (
    <>
      <h1 className="font-display text-title">Orders</h1>
      {orders.length ? (
        <div className="mt-8 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Status</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link className="link" href={`/account/orders/${o.order_number}`}>{o.order_number}</Link></td>
                  <td>{formatDate(o.created_at)}</td>
                  <td>{o.item_count}</td>
                  <td>{ORDER_STATUS_LABELS[o.status]}</td>
                  <td className="text-right">{o.total_kobo === null ? '—' : formatMoney(o.total_kobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-8 text-muted">No orders yet.</p>}
    </>
  );
}
