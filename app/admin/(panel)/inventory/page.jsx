import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { inventoryRows } from '@/db/queries/admin';
import { adjustStockAction } from '@/app/actions/admin/catalog';
import SubmitButton from '@/components/admin/SubmitButton';
import { Flash, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'Inventory' };

export default async function InventoryAdmin({ searchParams }) {
  await requirePermission('inventory.manage');
  const sp = await searchParams;
  const rows = await inventoryRows({ q: sp.q ? String(sp.q).slice(0, 80) : '', low: sp.low === '1' });
  const back = `/admin/inventory?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.low ? { low: '1' } : {}) })}`;
  return (
    <>
      <PageHead title="Inventory" />
      <Flash sp={sp} />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div className="field"><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q || ''} className="input w-64" /></div>
        <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="low" value="1" defaultChecked={sp.low === '1'} /> Low stock only</label>
        <button className="btn btn-primary btn-sm mb-1">Filter</button>
      </form>
      <p className="mb-4 text-sm text-muted">Stock reserved by unpaid orders is already deducted and returns automatically if the order expires or is cancelled.</p>
      <div className="overflow-x-auto"><table className="table">
        <thead><tr><th>Item</th><th>SKU</th><th>In stock</th><th>Set stock to</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={`${r.product_id}-${r.variant_id || 0}`}>
            <td><Link className="link" href={`/admin/products/${r.product_id}`}>{r.name}</Link>{r.option_values && <span className="text-muted"> — {Object.values(r.option_values).join(' / ')}</span>}{r.status !== 'published' && <span className="tag ml-2">{r.status}</span>}</td>
            <td className="text-sm">{r.sku}</td>
            <td className={r.stock <= r.low_stock_threshold ? 'font-medium text-danger' : ''}>{r.stock}</td>
            <td>
              <form action={adjustStockAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="product_id" value={r.product_id} />
                {r.variant_id && <input type="hidden" name="variant_id" value={r.variant_id} />}
                <input type="hidden" name="back" value={back} />
                <input name="stock" type="number" min={0} defaultValue={r.stock} className="input w-24" aria-label="New stock level" />
                <select name="reason" className="input w-32" aria-label="Reason"><option value="restock">Restock</option><option value="adjustment">Count correction</option><option value="return">Return</option></select>
                <input name="note" placeholder="Note" className="input w-36" aria-label="Note" />
                <SubmitButton className="btn btn-outline btn-sm">Update</SubmitButton>
              </form>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      {!rows.length && <p className="py-8 text-muted">Nothing to show.</p>}
    </>
  );
}
