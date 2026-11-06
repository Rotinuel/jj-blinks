import { requirePermission } from '@/lib/auth';
import { loadShippingConfig, deliveryEstimateText } from '@/lib/shipping';
import { getSettings } from '@/lib/settings';
import { countryName } from '@/lib/countries';
import { formatMoney, koboToNairaInput } from '@/lib/currency';
import { blockedCountriesAction, deleteMethodAction, deleteZoneAction, saveMethodAction, saveZoneAction, shippingTextAction } from '@/app/actions/admin/store';
import SubmitButton from '@/components/admin/SubmitButton';
import { Field, Flash, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'Shipping' };

const TYPE_LABEL = { flat: 'Flat rate', weight: 'By weight', order_value: 'By order value', pickup: 'Pickup', quote: 'Manual quotation' };

function tableText(m) {
  if (m.type === 'weight') return (m.rate_table || []).map((t) => `${t.max_grams} = ${koboToNairaInput(t.rate_kobo)}`).join('\n');
  if (m.type === 'order_value') return (m.rate_table || []).map((t) => `${koboToNairaInput(t.min_subtotal_kobo)} = ${koboToNairaInput(t.rate_kobo)}`).join('\n');
  return '';
}

function MethodFields({ m = {}, zoneId }) {
  return (
    <>
      <input type="hidden" name="zone_id" value={zoneId} />
      <Field label="Name customers see" name="name" defaultValue={m.name} required />
      <Field label="Pricing" name="type"><select id="type" name="type" defaultValue={m.type || 'flat'} className="input">{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Flat rate (₦)" name="flat_rate" defaultValue={koboToNairaInput(m.flat_rate_kobo)} hint="For flat rate only. 0 = free." />
      <Field label="Free over (₦, optional)" name="free_over" defaultValue={koboToNairaInput(m.free_over_kobo)} />
      <Field label="Rate tiers" name="rate_table" type="textarea" defaultValue={tableText(m)} className="sm:col-span-2"
        hint='By weight: one line per tier "max grams = ₦", e.g. "1000 = 25000". By order value: "minimum order ₦ = ₦", e.g. "0 = 3000".' />
      <Field label="Delivery estimate — min days" name="est_days_min" type="number" min={0} defaultValue={m.est_days_min ?? ''} />
      <Field label="Delivery estimate — max days" name="est_days_max" type="number" min={0} defaultValue={m.est_days_max ?? ''} />
      <Field label="Carrier (shown to staff and on tracking)" name="carrier_name" defaultValue={m.carrier_name} />
      <Field label="Order" name="sort_order" type="number" defaultValue={m.sort_order ?? 0} />
      <Field label="Description for customers" name="description" defaultValue={m.description} className="sm:col-span-2" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={m.is_active ?? true} /> Available</label>
    </>
  );
}

export default async function ShippingAdmin({ searchParams }) {
  await requirePermission('shipping.manage');
  const [sp, cfg, settings] = await Promise.all([searchParams, loadShippingConfig(), getSettings()]);
  return (
    <>
      <PageHead title="Shipping" />
      <Flash sp={sp} />
      <p className="mb-8 max-w-3xl text-sm text-muted">Customers see only active methods in active zones for their country. A country can be in one zone; a “rest of world” zone catches countries not listed elsewhere. Manual quotation lets customers order first and pay after you set the delivery cost.</p>
      <div className="grid gap-6">
        {cfg.zones.map((z) => (
          <section key={z.id} className="border border-line bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl">{z.name} {!z.is_active && <span className="tag">Off</span>} {z.is_fallback && <span className="tag">Rest of world</span>}</h2>
              <p className="text-sm text-muted">{z.is_fallback ? 'All countries not in another zone' : z.countries.map(countryName).join(', ') || 'No countries yet'}</p>
            </div>
            <ul className="mt-4 divide-y divide-line">
              {z.methods.map((m) => (
                <li key={m.id} className="py-3">
                  <details>
                    <summary className="cursor-pointer text-sm">
                      <span className="font-medium">{m.name}</span> — {TYPE_LABEL[m.type]}{m.type === 'flat' && `: ${formatMoney(m.flat_rate_kobo)}`}{m.free_over_kobo ? `, free over ${formatMoney(m.free_over_kobo)}` : ''}{deliveryEstimateText(m) ? `, ${deliveryEstimateText(m)}` : ''}{!m.is_active && ' (off)'}
                    </summary>
                    <form action={saveMethodAction} className="mt-4 grid gap-4 sm:grid-cols-2"><input type="hidden" name="id" value={m.id} /><MethodFields m={m} zoneId={z.id} /><div className="sm:col-span-2"><SubmitButton className="btn btn-primary btn-sm">Save method</SubmitButton></div></form>
                    <form action={deleteMethodAction} className="mt-2"><input type="hidden" name="id" value={m.id} /><SubmitButton className="text-sm text-danger underline" confirm="Delete this delivery method?">Delete method</SubmitButton></form>
                  </details>
                </li>
              ))}
            </ul>
            <details className="mt-3"><summary className="link cursor-pointer text-sm">Add a delivery method</summary>
              <form action={saveMethodAction} className="mt-4 grid gap-4 sm:grid-cols-2"><MethodFields zoneId={z.id} /><div className="sm:col-span-2"><SubmitButton className="btn btn-primary btn-sm">Add method</SubmitButton></div></form>
            </details>
            <details className="mt-3"><summary className="link cursor-pointer text-sm">Edit zone</summary>
              <form action={saveZoneAction} className="mt-4 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={z.id} />
                <Field label="Zone name" name="name" defaultValue={z.name} required />
                <Field label="Order" name="sort_order" type="number" defaultValue={z.sort_order} />
                <Field label="Countries (two-letter codes)" name="countries" type="textarea" defaultValue={z.countries.join(', ')} className="sm:col-span-2" hint="e.g. GB, IE. Ignored for a rest-of-world zone." />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={z.is_active} /> Active</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_fallback" defaultChecked={z.is_fallback} /> Rest of world</label>
                <SubmitButton className="btn btn-primary btn-sm">Save zone</SubmitButton>
              </form>
              <form action={deleteZoneAction} className="mt-2"><input type="hidden" name="id" value={z.id} /><SubmitButton className="text-sm text-danger underline" confirm="Delete this zone and its methods?">Delete zone</SubmitButton></form>
            </details>
          </section>
        ))}
      </div>
      <div className="mt-12 grid gap-12 lg:grid-cols-2">
        <section><h2 className="mb-4 font-display text-2xl">Add a zone</h2>
          <form action={saveZoneAction} className="grid gap-4">
            <Field label="Zone name" name="name" required />
            <Field label="Countries (two-letter codes)" name="countries" type="textarea" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked /> Active</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_fallback" /> Rest of world</label>
            <SubmitButton className="btn btn-primary btn-sm justify-self-start">Add zone</SubmitButton>
          </form>
        </section>
        <section><h2 className="mb-4 font-display text-2xl">Restricted destinations</h2>
          <form action={blockedCountriesAction} className="grid gap-4">
            <Field label="Never deliver to (two-letter codes)" name="countries" type="textarea" defaultValue={cfg.blocked.map((b) => b.country_code.trim()).join(', ')} hint="Overrides every zone, including rest of world." />
            <SubmitButton className="btn btn-primary btn-sm justify-self-start">Save</SubmitButton>
          </form>
        </section>
      </div>
      <section className="mt-12 max-w-3xl"><h2 className="mb-4 font-display text-2xl">Shipping text</h2>
        <form action={shippingTextAction} className="grid gap-4">
          <Field label="Processing time note" name="processing_note" defaultValue={settings.shipping.processing_note} hint='Shown at checkout and on product pages, e.g. "Orders are dispatched within 2–4 business days."' />
          <Field label="Customs and duties notice" name="customs_notice" type="textarea" defaultValue={settings.shipping.customs_notice} required />
          <SubmitButton className="btn btn-primary btn-sm justify-self-start">Save text</SubmitButton>
        </form>
      </section>
    </>
  );
}
