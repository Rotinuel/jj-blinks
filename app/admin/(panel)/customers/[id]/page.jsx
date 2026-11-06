import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { one, query } from '@/lib/db';
import { countryName } from '@/lib/countries';
import { formatMoney } from '@/lib/currency';
import { formatDate, formatDateTime } from '@/lib/utilities';
import { customerActiveAction } from '@/app/actions/admin/store';
import SubmitButton from '@/components/admin/SubmitButton';
import { Flash, OrderStatus, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'Customer' };

export default async function CustomerAdmin({ params, searchParams }) {
  const user = await requirePermission('customers.view');
  const { id } = await params;
  const sp = await searchParams;
  const c = await one(`SELECT id, name, email, phone, is_active, created_at, last_login_at FROM users WHERE id = $1 AND role = 'customer'`, [Number(id)]);
  if (!c) notFound();
  const [orders, addresses] = await Promise.all([
    query('SELECT id, order_number, status, total_kobo, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [c.id]),
    query('SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC', [c.id]),
  ]);
  return (
    <>
      <PageHead title={c.name} back={{ href: '/admin/customers', label: 'Customers' }} />
      <Flash sp={sp} />
      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section>
          <h2 className="mb-3 font-display text-2xl">Orders</h2>
          {orders.length ? <table className="table"><tbody>{orders.map((o) => (
            <tr key={o.id}><td><Link className="link" href={`/admin/orders/${o.id}`}>{o.order_number}</Link></td><td><OrderStatus status={o.status} /></td><td>{formatDate(o.created_at)}</td><td className="text-right">{o.total_kobo === null ? '—' : formatMoney(o.total_kobo)}</td></tr>
          ))}</tbody></table> : <p className="text-muted">No orders.</p>}
        </section>
        <aside className="space-y-6 text-sm">
          <div className="bg-ivory-deep p-5">
            <p><a className="link" href={`mailto:${c.email}`}>{c.email}</a></p><p>{c.phone}</p>
            <p className="mt-3 text-muted">Joined {formatDate(c.created_at)}{c.last_login_at && `, last sign-in ${formatDateTime(c.last_login_at)}`}</p>
          </div>
          {addresses.map((a) => <address key={a.id} className="not-italic">{a.full_name}<br />{a.line1}<br />{a.city}, {countryName(a.country_code.trim())}<br />{a.phone}</address>)}
          {can(user.role, 'customers.manage') && (
            <form action={customerActiveAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={String(!c.is_active)} />
              <SubmitButton className="btn btn-outline btn-sm" confirm={c.is_active ? 'Deactivate this account? They will be signed out.' : undefined}>{c.is_active ? 'Deactivate account' : 'Reactivate account'}</SubmitButton>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
