import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { listRequests } from '@/db/queries/admin';
import { REQUEST_STATUS_LABELS } from '@/lib/custom-requests';
import { formatMoney } from '@/lib/currency';
import { formatDate } from '@/lib/utilities';
import { Flash, PageHead, RequestStatus } from '@/components/admin/ui';

export const metadata = { title: 'Custom & bulk requests' };

export default async function RequestsAdmin({ searchParams }) {
  await requirePermission('custom.view');
  const sp = await searchParams;
  const rows = await listRequests({ status: REQUEST_STATUS_LABELS[sp.status] ? sp.status : null, kind: ['custom', 'bulk'].includes(sp.kind) ? sp.kind : null });
  return (
    <>
      <PageHead title="Custom & bulk requests" />
      <Flash sp={sp} />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div className="field"><label className="label" htmlFor="status">Status</label><select id="status" name="status" defaultValue={sp.status || ''} className="input"><option value="">All</option>{Object.entries(REQUEST_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label className="label" htmlFor="kind">Type</label><select id="kind" name="kind" defaultValue={sp.kind || ''} className="input"><option value="">All</option><option value="custom">Custom</option><option value="bulk">Bulk</option></select></div>
        <button className="btn btn-primary btn-sm mb-1">Filter</button>
      </form>
      <div className="overflow-x-auto"><table className="table">
        <thead><tr><th>Reference</th><th>From</th><th>Product</th><th>Qty</th><th>Needed</th><th>Status</th><th>Quote</th><th>Received</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td><Link className="link" href={`/admin/requests/${r.id}`}>{r.reference}</Link></td>
            <td>{r.company ? `${r.company} (${r.name})` : r.name}</td><td>{r.product_type}</td><td>{r.quantity}</td>
            <td>{r.desired_date ? formatDate(r.desired_date) : '—'}</td><td><RequestStatus status={r.status} /></td>
            <td>{r.quote_kobo ? formatMoney(r.quote_kobo) : '—'}</td><td>{formatDate(r.created_at)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {!rows.length && <p className="py-8 text-muted">No requests.</p>}
    </>
  );
}
