import Link from 'next/link';
import Image from 'next/image';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { listProductsAdmin, listCategoriesAdmin } from '@/db/queries/admin';
import { formatMoney } from '@/lib/currency';
import { Flash, PageHead, Pager } from '@/components/admin/ui';

export const metadata = { title: 'Products' };

export default async function ProductsAdmin({ searchParams }) {
  const user = await requirePermission('products.view');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [data, cats] = await Promise.all([
    listProductsAdmin({ q: sp.q ? String(sp.q).slice(0, 80) : '', status: ['draft', 'published', 'archived'].includes(sp.status) ? sp.status : null, category: sp.category || null, page }),
    listCategoriesAdmin(),
  ]);
  const href = (n) => `/admin/products?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.status ? { status: sp.status } : {}), ...(sp.category ? { category: sp.category } : {}), page: String(n) })}`;
  return (
    <>
      <PageHead title="Products">{can(user.role, 'products.edit') && <Link href="/admin/products/new" className="btn btn-primary btn-sm">Add product</Link>}</PageHead>
      <Flash sp={sp} />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div className="field"><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q || ''} className="input w-64" placeholder="Name or SKU" /></div>
        <div className="field"><label className="label" htmlFor="status">Status</label><select id="status" name="status" defaultValue={sp.status || ''} className="input"><option value="">All</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div>
        <div className="field"><label className="label" htmlFor="category">Collection</label><select id="category" name="category" defaultValue={sp.category || ''} className="input"><option value="">All</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <button className="btn btn-primary btn-sm mb-1">Filter</button>
      </form>
      <div className="overflow-x-auto"><table className="table">
        <thead><tr><th></th><th>Product</th><th>Collection</th><th>Status</th><th>Price</th><th>Stock</th></tr></thead>
        <tbody>{data.rows.map((p) => (
          <tr key={p.id}>
            <td className="w-14"><div className="relative h-14 w-11 bg-ivory-deep">{p.image_url && <Image src={p.image_url} alt="" fill sizes="3rem" className="object-cover" />}</div></td>
            <td><Link className="link" href={`/admin/products/${p.id}`}>{p.name}</Link>{p.is_sample && <span className="tag tag-warn ml-2">Sample</span>}{p.is_featured && <span className="tag ml-2">Featured</span>}<br /><span className="text-xs text-muted">{p.sku}</span></td>
            <td>{p.category_name || '—'}</td>
            <td>{p.status}</td>
            <td>{formatMoney(p.price_kobo)}</td>
            <td>{!p.track_inventory ? 'Not tracked' : p.variant_count ? `${p.variant_stock} across ${p.variant_count} variants` : p.stock}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {!data.rows.length && <p className="py-8 text-muted">No products yet. {can(user.role, 'products.edit') && <Link className="link" href="/admin/products/new">Add the first one</Link>}</p>}
      <Pager page={data.page} pages={data.pages} href={href} />
    </>
  );
}
