import { koboToNairaInput } from '@/lib/currency';
import { customizationsToText, optionsToText } from '@/lib/product-form';
import { saveProductAction } from '@/app/actions/admin/catalog';
import { Field } from './ui';
import SubmitButton from './SubmitButton';

export default function ProductForm({ product, categories, canCost, hasVariants }) {
  const p = product || { status: 'draft', track_inventory: true, low_stock_threshold: 3, tags: [], options: [], customization_options: [] };
  return (
    <form action={saveProductAction} className="grid gap-6 lg:grid-cols-2">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <Field label="Name" name="name" defaultValue={p.name} required />
      <Field label="URL slug" name="slug" defaultValue={p.slug} hint="Leave empty to create from the name." />
      <Field label="SKU" name="sku" defaultValue={p.sku} required />
      <Field label="Collection" name="category_id">
        <select id="category_id" name="category_id" defaultValue={p.category_id || ''} className="input">
          <option value="">None</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Price (₦)" name="price" defaultValue={koboToNairaInput(p.price_kobo)} inputMode="decimal" required hint={hasVariants ? 'Used for variants without their own price.' : undefined} />
      <Field label="Comparison price (₦, optional)" name="compare_at" defaultValue={koboToNairaInput(p.compare_at_kobo)} inputMode="decimal" hint="Only if the item was genuinely sold at this higher price." />
      {canCost && <Field label="Cost price (₦, internal)" name="cost" defaultValue={koboToNairaInput(p.cost_kobo)} inputMode="decimal" hint="Never shown to customers." />}
      <Field label="Status" name="status">
        <select id="status" name="status" defaultValue={p.status} className="input">
          <option value="draft">Draft — hidden</option><option value="published">Published — on sale</option><option value="archived">Archived</option>
        </select>
      </Field>
      <Field label="Short description" name="short_description" defaultValue={p.short_description} maxLength={300} className="lg:col-span-2" />
      <Field label="Full description" name="description" type="textarea" defaultValue={p.description} className="lg:col-span-2" />
      <Field label="Materials" name="materials" type="textarea" defaultValue={p.materials} />
      <Field label="Care" name="care" type="textarea" defaultValue={p.care} />
      <Field label="Options" name="options" type="textarea" defaultValue={optionsToText(p.options)}
        hint='One per line, e.g. "Colour: Gold, Wine". Then use “Create variants” to set stock and prices per combination.' />
      <Field label="Customer customisation fields" name="customizations" type="textarea" defaultValue={customizationsToText(p.customization_options)}
        hint='One per line: "Name to print | text | required | 40" or "Thread | select: Gold, Silver | optional".' />
      {!hasVariants && <Field label="Stock" name="stock" type="number" min={0} defaultValue={p.stock ?? 0} hint={p.id ? 'Use Inventory for adjustments with a reason.' : undefined} />}
      <Field label="Low-stock alert at" name="low_stock_threshold" type="number" min={0} defaultValue={p.low_stock_threshold} />
      <Field label="Weight (grams)" name="weight_grams" type="number" min={0} defaultValue={p.weight_grams ?? ''} hint="Needed for weight-based shipping rates." />
      <Field label="Tags" name="tags" defaultValue={(p.tags || []).join(', ')} hint="Comma separated. Used in search." />
      <div className="flex flex-wrap gap-6 lg:col-span-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="track_inventory" defaultChecked={p.track_inventory} /> Track stock</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_featured" defaultChecked={p.is_featured} /> Feature on the homepage</label>
      </div>
      <Field label="SEO title (optional)" name="seo_title" defaultValue={p.seo_title} maxLength={70} />
      <Field label="SEO description (optional)" name="seo_description" defaultValue={p.seo_description} maxLength={160} />
      <div className="lg:col-span-2"><SubmitButton>{p.id ? 'Save product' : 'Create product'}</SubmitButton></div>
    </form>
  );
}
