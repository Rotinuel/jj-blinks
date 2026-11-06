import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { listOrders } from '@/db/queries/admin';
import { ORDER_STATUS_LABELS } from '@/lib/orders';
import { formatMoney } from '@/lib/currency';
import { formatDateTime } from '@/lib/utilities';
import { Flash, OrderStatus, PageHead, Pager } from '@/components/admin/ui';

export const metadata = { title: 'Orders' };

export default async function OrdersAdmin({ searchParams }) {
  await requirePermission('orders.view');
  const sp = await searchParams;
  const status = ORDER_STATUS_LABELS[sp.status] ? sp.status : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listOrders({ status, q: sp.q ? String(sp.q).slice(0, 80) : '', attention: sp.attention === '1', page });
  const href = (n) => `/admin/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(sp.q ? { q: sp.q } : {}), ...(sp.attention ? { attention: '1' } : {}), page: String(n) })}`;
  return (
    <>
      <PageHead title="Orders" />
      <Flash sp={sp} />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div className="field"><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q || ''} placeholder="Order, name, email, phone" className="input w-72" /></div>
        <div className="field"><label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status || ''} className="input"><option value="">All</option>{Object.entries(ORDER_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="attention" value="1" defaultChecked={sp.attention === '1'} /> Needs attention</label>
        <button className="btn btn-primary btn-sm mb-1">Filter</button>
      </form>
      <p className="mb-2 text-sm text-muted">{data.total} orders</p>
      <div className="overflow-x-auto"><table className="table">
        <thead><tr><th>Order</th><th>Customer</th><th>Country</th><th>Status</th><th>Payment</th><th>Placed</th><th className="text-right">Total</th></tr></thead>
        <tbody>{data.rows.map((o) => (
          <tr key={o.id}>
            <td><Link className="link" href={`/admin/orders/${o.id}`}>{o.order_number}</Link>{o.kind === 'custom' && <span className="tag ml-2">Custom</span>}{o.needs_attention && <span className="tag tag-warn ml-2">Check</span>}</td>
            <td>{o.customer_name}<br /><span className="text-xs text-muted">{o.email}</span></td>
            <td>{o.country}</td>
            <td><OrderStatus status={o.status} /></td>
            <td className="text-sm">{o.payment_status}</td>
            <td className="text-sm">{formatDateTime(o.created_at)}</td>
            <td className="text-right">{o.total_kobo === null ? '—' : formatMoney(o.total_kobo)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {!data.rows.length && <p className="py-8 text-muted">No orders match.</p>}
      <Pager page={data.page} pages={data.pages} href={href} />
    </>
  );
}
