import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { dashboardCounts, listOrders, lowStock, salesSummary } from '@/db/queries/admin';
import { formatMoney } from '@/lib/currency';
import { formatDateTime } from '@/lib/utilities';
import { paymentsConfigured } from '@/lib/payments';
import { emailConfigured } from '@/lib/email';
import { blobConfigured } from '@/lib/storage';
import { Flash, OrderStatus, PageHead, Stat } from '@/components/admin/ui';

export const metadata = { title: 'Dashboard' };

export default async function Dashboard({ searchParams }) {
  const user = await requirePermission('dashboard.view');
  const sp = await searchParams;
  const finance = can(user.role, 'finance.view');
  const seeOrders = can(user.role, 'orders.view');
  const [counts, recent, low, sales] = await Promise.all([
    dashboardCounts(),
    seeOrders ? listOrders({ perPage: 8 }) : { rows: [] },
    can(user.role, 'inventory.manage') || can(user.role, 'products.view') ? lowStock(8) : [],
    finance ? salesSummary(30) : null,
  ]);
  const setup = [
    !paymentsConfigured() && 'Paystack is not connected (PAYSTACK_SECRET_KEY). Customers cannot pay online.',
    !emailConfigured() && 'Email (SMTP) is not configured. No confirmations or password-reset emails are sent.',
    !blobConfigured() && process.env.NODE_ENV === 'production' && 'Vercel Blob is not connected (BLOB_READ_WRITE_TOKEN). Image uploads are disabled.',
  ].filter(Boolean);

  return (
    <>
      <PageHead title="Dashboard" />
      <Flash sp={sp} />
      {setup.length > 0 && user.role === 'super_admin' && (
        <div className="notice mb-8"><p className="font-medium">Setup still needed</p><ul className="mt-1 list-disc pl-5 text-sm">{setup.map((s) => <li key={s}>{s}</li>)}</ul></div>
      )}
      {finance && sales && (
        <section className="mb-10">
          <h2 className="mb-4 text-sm text-muted">Verified payments, last 30 days</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Paid orders" value={sales.orders} />
            <Stat label="Gross sales" value={formatMoney(sales.gross_kobo)} note="Items + delivery" />
            <Stat label="Discounts" value={formatMoney(sales.discount_kobo)} />
            <Stat label="Refunds" value={formatMoney(sales.refunded_kobo)} />
            <Stat label="Net sales" value={formatMoney(sales.net_kobo)} href="/admin/analytics" />
          </div>
        </section>
      )}
      <section className="mb-10 grid gap-6 sm:grid-cols-3 lg:grid-cols-6">
        {seeOrders && <Stat label="To fulfil" value={counts.to_fulfil} href="/admin/orders?status=paid" />}
        {seeOrders && <Stat label="Awaiting payment" value={counts.pending_payment} href="/admin/orders?status=pending_payment" />}
        {seeOrders && <Stat label="Need a shipping quote" value={counts.awaiting_quote} href="/admin/orders?status=awaiting_quote" />}
        {seeOrders && <Stat label="Need attention" value={counts.needs_attention} href="/admin/orders?attention=1" />}
        {can(user.role, 'custom.view') && <Stat label="Open requests" value={counts.open_requests} href="/admin/requests" />}
        {can(user.role, 'reviews.moderate') && <Stat label="Reviews to check" value={counts.pending_reviews} href="/admin/reviews" />}
      </section>
      <div className="grid gap-10 xl:grid-cols-[2fr_1fr]">
        {seeOrders && (
          <section>
            <div className="mb-3 flex justify-between"><h2 className="font-display text-2xl">Recent orders</h2><Link href="/admin/orders" className="link text-sm">All orders</Link></div>
            {recent.rows.length ? (
              <div className="overflow-x-auto"><table className="table">
                <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Placed</th><th className="text-right">Total</th></tr></thead>
                <tbody>{recent.rows.map((o) => (
                  <tr key={o.id}>
                    <td><Link className="link" href={`/admin/orders/${o.id}`}>{o.order_number}</Link>{o.needs_attention && <span className="tag tag-warn ml-2">Check</span>}</td>
                    <td>{o.customer_name}</td><td><OrderStatus status={o.status} /></td><td>{formatDateTime(o.created_at)}</td>
                    <td className="text-right">{o.total_kobo === null ? '—' : formatMoney(o.total_kobo)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <p className="text-muted">No orders yet.</p>}
          </section>
        )}
        {low.length > 0 && (
          <section>
            <div className="mb-3 flex justify-between"><h2 className="font-display text-2xl">Low stock</h2><Link href="/admin/inventory?low=1" className="link text-sm">Inventory</Link></div>
            <ul className="divide-y divide-line text-sm">
              {low.map((r, i) => (
                <li key={i} className="flex justify-between gap-4 py-2">
                  <Link href={`/admin/products/${r.id}`} className="hover:text-wine">{r.name}{r.variant ? ` (${Object.values(JSON.parse(r.variant)).join(' / ')})` : ''}</Link>
                  <span className={r.stock === 0 ? 'text-danger' : ''}>{r.stock}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
