import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { listCustomers } from '@/db/queries/admin';
import { formatMoney } from '@/lib/currency';
import { formatDate } from '@/lib/utilities';
import { Flash, PageHead, Pager } from '@/components/admin/ui';

export const metadata = { title: 'Customers' };

export default async function CustomersAdmin({ searchParams }) {
  const user = await requirePermission('customers.view');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listCustomers({ q: sp.q ? String(sp.q).slice(0, 80) : '', page });
  const finance = can(user.role, 'finance.view');
  return (
    <>
      <PageHead title="Customers" />
      <Flash sp={sp} />
      <form className="mb-6 flex gap-3"><input name="q" defaultValue={sp.q || ''} placeholder="Name, email or phone" className="input w-72" aria-label="Search customers" /><button className="btn btn-primary btn-sm">Search</button></form>
      <p className="mb-2 text-sm text-muted">{data.total} registered customers. Guest buyers appear on their orders only.</p>
      <div className="overflow-x-auto"><table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Orders</th>{finance && <th>Spent</th>}<th>Joined</th><th>Status</th></tr></thead>
        <tbody>{data.rows.map((c) => (
          <tr key={c.id}>
            <td><Link className="link" href={`/admin/customers/${c.id}`}>{c.name}</Link></td><td>{c.email}</td><td>{c.order_count}</td>
            {finance && <td>{formatMoney(c.spent_kobo)}</td>}<td>{formatDate(c.created_at)}</td><td>{c.is_active ? 'Active' : 'Deactivated'}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <Pager page={data.page} pages={data.pages} href={(n) => `/admin/customers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(n) })}`} />
    </>
  );
}
