import Image from 'next/image';
import { requirePermission } from '@/lib/auth';
import { listCategoriesAdmin } from '@/db/queries/admin';
import { deleteCategoryAction, removeCategoryImageAction, saveCategoryAction } from '@/app/actions/admin/catalog';
import SingleImageUpload from '@/components/admin/SingleImageUpload';
import SubmitButton from '@/components/admin/SubmitButton';
import { Field, Flash, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'Collections' };

function CategoryFields({ c = {} }) {
  return (
    <>
      <Field label="Name" name="name" defaultValue={c.name} required />
      <Field label="Slug" name="slug" defaultValue={c.slug} />
      <Field label="Description" name="description" defaultValue={c.description} className="sm:col-span-2" />
      <Field label="Type" name="kind"><select id="kind" name="kind" defaultValue={c.kind || 'shop'} className="input"><option value="shop">Shop collection</option><option value="service">Enquiry only (links to request form)</option></select></Field>
      <Field label="Order" name="sort_order" type="number" defaultValue={c.sort_order ?? 0} />
      <Field label="Image description (alt)" name="image_alt" defaultValue={c.image_alt} />
      <Field label="SEO title" name="seo_title" defaultValue={c.seo_title} maxLength={70} />
      <Field label="SEO description" name="seo_description" defaultValue={c.seo_description} maxLength={160} className="sm:col-span-2" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={c.is_active ?? true} /> Visible</label>
    </>
  );
}

export default async function CategoriesAdmin({ searchParams }) {
  await requirePermission('categories.manage');
  const [sp, cats] = await Promise.all([searchParams, listCategoriesAdmin()]);
  return (
    <>
      <PageHead title="Collections" />
      <Flash sp={sp} />
      <div className="grid gap-6">
        {cats.map((c) => (
          <details key={c.id} className="border border-line bg-white">
            <summary className="flex cursor-pointer items-center gap-4 p-4">
              <span className="relative h-14 w-11 shrink-0 bg-ivory-deep">{c.image_url && <Image src={c.image_url} alt="" fill sizes="3rem" className="object-cover" />}</span>
              <span className="flex-1"><span className="font-medium">{c.name}</span> <span className="text-sm text-muted">/{c.slug} · {c.product_count} products{!c.is_active && ' · hidden'}{c.kind === 'service' && ' · enquiry only'}</span></span>
            </summary>
            <div className="border-t border-line p-4">
              <div className="mb-4 flex gap-6">
                <SingleImageUpload fields={{ purpose: 'category', categoryId: c.id }} hasImage={Boolean(c.image_url)} />
                {c.image_url && <form action={removeCategoryImageAction}><input type="hidden" name="id" value={c.id} /><button className="text-sm text-danger underline">Remove image</button></form>}
              </div>
              <form action={saveCategoryAction} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={c.id} />
                <CategoryFields c={c} />
                <div className="flex gap-4 sm:col-span-2"><SubmitButton className="btn btn-primary btn-sm">Save</SubmitButton></div>
              </form>
              <form action={deleteCategoryAction} className="mt-4"><input type="hidden" name="id" value={c.id} /><SubmitButton className="text-sm text-danger underline" confirm={`Delete ${c.name}? Its products become uncategorised.`}>Delete collection</SubmitButton></form>
            </div>
          </details>
        ))}
      </div>
      <section className="mt-12 max-w-3xl">
        <h2 className="mb-4 font-display text-2xl">Add a collection</h2>
        <form action={saveCategoryAction} className="grid gap-4 sm:grid-cols-2"><CategoryFields /><div className="sm:col-span-2"><SubmitButton className="btn btn-primary btn-sm">Add collection</SubmitButton></div></form>
      </section>
    </>
  );
}
