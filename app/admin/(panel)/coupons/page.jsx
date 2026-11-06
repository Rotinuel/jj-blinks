import { requirePermission } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatMoney, koboToNairaInput } from '@/lib/currency';
import { formatDateTime } from '@/lib/utilities';
import { deleteCouponAction, saveCouponAction } from '@/app/actions/admin/store';
import SubmitButton from '@/components/admin/SubmitButton';
import { Field, Flash, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'Discounts' };

const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() + 3600e3).toISOString().slice(0, 16) : '');

function CouponFields({ c = {} }) {
  return (
    <>
      <Field label="Code" name="code" defaultValue={c.code} required />
      <Field label="Type" name="type"><select id="type" name="type" defaultValue={c.type || 'percent'} className="input"><option value="percent">Percentage off</option><option value="fixed">Fixed amount off (₦)</option><option value="free_shipping">Free delivery</option></select></Field>
      <Field label="Value (% or ₦)" name="value" defaultValue={c.type === 'fixed' ? koboToNairaInput(c.value) : c.value || ''} hint="Ignored for free delivery." />
      <Field label="Minimum spend (₦)" name="min_subtotal" defaultValue={koboToNairaInput(c.min_subtotal_kobo) || ''} />
      <Field label="Maximum discount (₦)" name="max_discount" defaultValue={koboToNairaInput(c.max_discount_kobo)} />
      <Field label="Total uses allowed" name="usage_limit" type="number" min={1} defaultValue={c.usage_limit ?? ''} />
      <Field label="Uses per customer email" name="usage_limit_per_email" type="number" min={1} defaultValue={c.usage_limit_per_email ?? ''} />
      <Field label="Starts (Lagos time)" name="starts_at" type="datetime-local" defaultValue={toLocal(c.starts_at)} />
      <Field label="Ends (Lagos time)" name="ends_at" type="datetime-local" defaultValue={toLocal(c.ends_at)} />
      <Field label="Internal description" name="description" defaultValue={c.description} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={c.is_active ?? true} /> Active</label>
    </>
  );
}

export default async function CouponsAdmin({ searchParams }) {
  await requirePermission('coupons.manage');
  const sp = await searchParams;
  const rows = await query('SELECT * FROM coupons ORDER BY created_at DESC');
  return (
    <>
      <PageHead title="Discounts" />
      <Flash sp={sp} />
      <div className="grid gap-4">
        {rows.map((c) => (
          <details key={c.id} className="border border-line bg-white">
            <summary className="cursor-pointer p-4">
              <span className="font-medium">{c.code}</span>{' '}
              <span className="text-sm text-muted">
                {c.type === 'percent' ? `${c.value}% off` : c.type === 'fixed' ? `${formatMoney(c.value)} off` : 'Free delivery'} · used {c.used_count}{c.usage_limit ? `/${c.usage_limit}` : ''}
                {!c.is_active && ' · inactive'}{c.ends_at && ` · ends ${formatDateTime(c.ends_at)}`}
              </span>
            </summary>
            <div className="border-t border-line p-4">
              <form action={saveCouponAction} className="grid gap-4 sm:grid-cols-3"><input type="hidden" name="id" value={c.id} /><CouponFields c={c} /><div className="sm:col-span-3"><SubmitButton className="btn btn-primary btn-sm">Save</SubmitButton></div></form>
              <form action={deleteCouponAction} className="mt-3"><input type="hidden" name="id" value={c.id} /><SubmitButton className="text-sm text-danger underline" confirm="Delete this code?">Delete</SubmitButton></form>
            </div>
          </details>
        ))}
        {!rows.length && <p className="text-muted">No discount codes yet.</p>}
      </div>
      <section className="mt-12"><h2 className="mb-4 font-display text-2xl">New discount code</h2>
        <form action={saveCouponAction} className="grid gap-4 sm:grid-cols-3"><CouponFields /><div className="sm:col-span-3"><SubmitButton className="btn btn-primary btn-sm">Create code</SubmitButton></div></form>
      </section>
    </>
  );
}
