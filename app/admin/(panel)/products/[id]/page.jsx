import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { getProductAdmin, listCategoriesAdmin } from '@/db/queries/admin';
import { koboToNairaInput } from '@/lib/currency';
import { formatDateTime } from '@/lib/utilities';
import { deleteProductAction, deleteVariantAction, generateVariantsAction, saveVariantAction } from '@/app/actions/admin/catalog';
import ProductForm from '@/components/admin/ProductForm';
import ImageManager from '@/components/admin/ImageManager';
import SubmitButton from '@/components/admin/SubmitButton';
import { Flash, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'Edit product' };

export default async function EditProduct({ params, searchParams }) {
  const user = await requirePermission('products.view');
  const { id } = await params;
  const [sp, data, cats] = await Promise.all([searchParams, getProductAdmin(Number(id)), listCategoriesAdmin()]);
  if (!data) notFound();
  const { product: p, variants, images, movements } = data;
  const edit = can(user.role, 'products.edit');
  if (!can(user.role, 'products.cost')) delete p.cost_kobo;
  return (
    <>
      <PageHead title={p.name} back={{ href: '/admin/products', label: 'Products' }}>
        {p.status === 'published' && <Link href={`/products/${p.slug}`} className="link text-sm" target="_blank">View in store</Link>}
      </PageHead>
      <Flash sp={sp} />
      {edit ? (
        <>
          <section className="mb-12"><h2 className="mb-4 font-display text-2xl">Photos</h2><ImageManager productId={p.id} images={images} /></section>
          <section className="mb-12"><h2 className="mb-4 font-display text-2xl">Details</h2><ProductForm product={p} categories={cats} canCost={can(user.role, 'products.cost')} hasVariants={variants.length > 0} /></section>
          <section className="mb-12">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="font-display text-2xl">Variants</h2>
              <form action={generateVariantsAction}><input type="hidden" name="id" value={p.id} /><SubmitButton className="btn btn-outline btn-sm">Create variants from options</SubmitButton></form>
            </div>
            {variants.length ? (
              <div className="grid gap-2">
                <div className="hidden grid-cols-[1.4fr_1.2fr_1fr_1fr_0.7fr_auto_auto] gap-2 text-xs text-muted md:grid"><span>Option</span><span>SKU</span><span>Price ₦ (empty = product price)</span><span>Compare ₦</span><span>Stock</span><span>Active</span><span /></div>
                {variants.map((v) => (
                  <div key={v.id} className="grid items-center gap-2 border-b border-line pb-2 md:grid-cols-[1.4fr_1.2fr_1fr_1fr_0.7fr_auto_auto]">
                    <form action={saveVariantAction} className="contents">
                      <input type="hidden" name="product_id" value={p.id} /><input type="hidden" name="id" value={v.id} />
                      <span className="text-sm">{Object.values(v.option_values).join(' / ')}</span>
                      <input name="sku" defaultValue={v.sku} className="input" aria-label="Variant SKU" />
                      <input name="price" defaultValue={koboToNairaInput(v.price_kobo)} className="input" inputMode="decimal" aria-label="Variant price" />
                      <input name="compare_at" defaultValue={koboToNairaInput(v.compare_at_kobo)} className="input" inputMode="decimal" aria-label="Variant comparison price" />
                      <input name="stock" type="number" min={0} defaultValue={v.stock} className="input" aria-label="Variant stock" />
                      <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="is_active" defaultChecked={v.is_active} /> On</label>
                      <SubmitButton className="btn btn-outline btn-sm">Save</SubmitButton>
                    </form>
                    <form action={deleteVariantAction} className="md:col-start-7"><input type="hidden" name="product_id" value={p.id} /><input type="hidden" name="id" value={v.id} /><SubmitButton className="text-xs text-danger underline" confirm="Remove this variant?">Remove</SubmitButton></form>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted">No variants. Add options above (e.g. sizes or colours) to sell combinations with their own stock.</p>}
          </section>
        </>
      ) : <p className="notice">You can view this product but not edit it.</p>}
      <section className="mb-12">
        <h2 className="mb-3 font-display text-2xl">Recent stock movements</h2>
        {movements.length ? (
          <table className="table"><thead><tr><th>When</th><th>Change</th><th>Reason</th><th>By</th><th>Note</th></tr></thead>
            <tbody>{movements.map((m) => <tr key={m.id}><td>{formatDateTime(m.created_at)}</td><td>{m.change > 0 ? `+${m.change}` : m.change}</td><td>{m.reason.replace('_', ' ')}</td><td>{m.actor_name || (m.order_id ? `Order #${m.order_id}` : '—')}</td><td>{m.note}</td></tr>)}</tbody>
          </table>
        ) : <p className="text-sm text-muted">None yet.</p>}
      </section>
      {can(user.role, 'products.delete') && (
        <form action={deleteProductAction} className="border-t border-line pt-6">
          <input type="hidden" name="id" value={p.id} />
          <p className="mb-3 text-sm text-muted">Prefer archiving to keep history. Deleting removes the product and its photos permanently; past orders keep their copy.</p>
          <SubmitButton className="btn btn-outline btn-sm text-danger" confirm="Delete this product and its photos permanently?">Delete product</SubmitButton>
        </form>
      )}
    </>
  );
}
