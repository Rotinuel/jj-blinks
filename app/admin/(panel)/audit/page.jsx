import { requirePermission } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatDateTime } from '@/lib/utilities';
import { PageHead, Pager } from '@/components/admin/ui';

export const metadata = { title: 'Audit log' };

export default async function AuditAdmin({ searchParams }) {
  await requirePermission('audit.view');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const params = [];
  let where = '';
  if (sp.q) { params.push(`%${String(sp.q).slice(0, 60).replace(/[\\%_]/g, (c) => '\\' + c)}%`); where = 'WHERE action ILIKE $1 OR actor_email ILIKE $1 OR entity_id ILIKE $1'; }
  params.push(50, (page - 1) * 50);
  const rows = await query(
    `SELECT *, COUNT(*) OVER() AS total_count FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const total = rows[0] ? Number(rows[0].total_count) : 0;
  return (
    <>
      <PageHead title="Audit log" />
      <form className="mb-6 flex gap-3"><input name="q" defaultValue={sp.q || ''} placeholder="Action, email or id" className="input w-72" aria-label="Filter" /><button className="btn btn-primary btn-sm">Filter</button></form>
      <div className="overflow-x-auto"><table className="table">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Item</th><th>Details</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td><td>{r.actor_email || 'System'}</td><td>{r.action}</td><td>{r.entity_type} {r.entity_id}</td><td className="max-w-md break-all text-xs text-muted">{Object.keys(r.details || {}).length ? JSON.stringify(r.details) : ''}</td></tr>
        ))}</tbody>
      </table></div>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / 50))} href={(n) => `/admin/audit?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(n) })}`} />
    </>
  );
}
