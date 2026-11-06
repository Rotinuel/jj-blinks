import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { getRequestAdmin } from '@/db/queries/admin';
import { REQUEST_STATUS_LABELS, REQUEST_TRANSITIONS } from '@/lib/custom-requests';
import { requestTrackUrl } from '@/lib/notifications';
import { countryName } from '@/lib/countries';
import { formatMoney, koboToNairaInput } from '@/lib/currency';
import { formatDate, formatDateTime, whatsappLink } from '@/lib/utilities';
import { issueQuoteAction, requestNotesAction, requestStatusAction } from '@/app/actions/admin/store';
import SubmitButton from '@/components/admin/SubmitButton';
import { Field, Flash, OrderStatus, PageHead, RequestStatus } from '@/components/admin/ui';

export const metadata = { title: 'Request' };

export default async function RequestAdmin({ params, searchParams }) {
  const user = await requirePermission('custom.view');
  const { id } = await params;
  const sp = await searchParams;
  const data = await getRequestAdmin(Number(id));
  if (!data) notFound();
  const { req: r, events, files, order } = data;
  const next = (REQUEST_TRANSITIONS[r.status] || []).filter((s) => s !== 'approved' || r.quote_kobo);
  const canQuote = can(user.role, 'custom.quote') && ['new', 'reviewing', 'quoted'].includes(r.status) && !r.order_id;
  const wa = whatsappLink(r.phone, `Hello ${r.name}, this is JJ BLINKS about your request ${r.reference}.`);
  return (
    <>
      <PageHead title={r.reference} back={{ href: '/admin/requests', label: 'Requests' }}><RequestStatus status={r.status} /><span className="tag">{r.kind}</span></PageHead>
      <Flash sp={sp} />
      <div className="grid gap-10 xl:grid-cols-[1.6fr_1fr]">
        <div className="grid content-start gap-10">
          <section>
            <h2 className="mb-3 font-display text-2xl">Brief</h2>
            <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Product</dt><dd>{r.product_type}</dd>
              <dt className="text-muted">Quantity</dt><dd>{r.quantity}</dd>
              <dt className="text-muted">Occasion</dt><dd>{r.occasion || '—'}</dd>
              <dt className="text-muted">Colours</dt><dd>{r.colours || '—'}</dd>
              <dt className="text-muted">Needed by</dt><dd>{r.desired_date ? formatDate(r.desired_date) : '—'}</dd>
              <dt className="text-muted">Budget</dt><dd>{r.budget_amount ? formatMoney(r.budget_amount, r.budget_currency || 'NGN') : '—'}</dd>
              <dt className="text-muted">Delivery country</dt><dd>{r.country_code ? countryName(r.country_code.trim()) : '—'}</dd>
            </dl>
            <p className="mt-4 whitespace-pre-line">{r.style_description}</p>
            {r.apparel && (
              <div className="mt-4 text-sm">
                <p className="font-medium">Apparel</p>
                <p>{r.apparel.garment_type} {r.apparel.garment_colour && `· ${r.apparel.garment_colour}`}</p>
                {r.apparel.sizes && Object.keys(r.apparel.sizes).length > 0 && <p>Sizes: {Object.entries(r.apparel.sizes).map(([k, v]) => `${k} × ${v}`).join(', ')}</p>}
                {r.apparel.branding && <p className="whitespace-pre-line">Branding: {r.apparel.branding}</p>}
              </div>
            )}
            {r.details?.notes && <p className="mt-4 whitespace-pre-line text-sm">Notes: {r.details.notes}</p>}
            {files.length > 0 && <ul className="mt-4 flex flex-wrap gap-3">{files.map((f) => (
              <li key={f.url}><a href={f.url} target="_blank" rel="noopener noreferrer" className="block">{f.content_type === 'application/pdf' ? <span className="tag">{f.role} PDF</span> : <img src={f.url} alt={f.role} className="h-28 w-28 object-cover" />}</a></li>
            ))}</ul>}
          </section>

          {canQuote && (
            <section className="border border-gold p-5">
              <h2 className="font-display text-2xl">{r.quote_kobo ? 'Revise quotation' : 'Issue quotation'}</h2>
              <form action={issueQuoteAction} className="mt-4 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={r.id} />
                <Field label="Total amount (₦)" name="amount" defaultValue={koboToNairaInput(r.quote_kobo)} inputMode="decimal" required hint="Include delivery if applicable." />
                <Field label="Valid until" name="valid_until" type="date" defaultValue={r.quote_valid_until || ''} />
                <Field label="Notes for the customer" name="notes" type="textarea" defaultValue={r.quote_notes} className="sm:col-span-2" />
                <SubmitButton>Send quotation</SubmitButton>
              </form>
            </section>
          )}
          {r.quote_kobo && !canQuote && <p className="notice">Quoted {formatMoney(r.quote_kobo)}{r.quote_valid_until && `, valid until ${formatDate(r.quote_valid_until)}`}.</p>}

          {can(user.role, 'custom.manage') && next.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-2xl">Update status</h2>
              <form action={requestStatusAction} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={r.id} />
                <Field label="New status" name="status"><select id="status" name="status" className="input">{next.map((s) => <option key={s} value={s}>{REQUEST_STATUS_LABELS[s]}</option>)}</select></Field>
                <Field label="Note to customer (optional)" name="note" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked /> Email the customer</label>
                <SubmitButton>Update</SubmitButton>
              </form>
              {next.includes('approved') && <p className="mt-2 text-xs text-muted">Approve here only if the customer accepted in writing; otherwise they accept from their link, which creates the payable order.</p>}
            </section>
          )}

          <section>
            <h2 className="mb-3 font-display text-2xl">History</h2>
            <ol className="space-y-2 border-l border-gold pl-5 text-sm">{events.map((e) => (
              <li key={e.id}><span className="text-muted">{formatDateTime(e.created_at)}</span> {e.status && <strong>{REQUEST_STATUS_LABELS[e.status]}</strong>} {e.note} {e.actor_name && <span className="text-muted">— {e.actor_name}</span>}</li>
            ))}</ol>
          </section>
        </div>
        <aside className="grid content-start gap-6 text-sm">
          <div className="bg-ivory-deep p-5">
            {r.company && <p className="font-medium">{r.company}</p>}
            <p>{r.name}</p><p><a className="link" href={`mailto:${r.email}`}>{r.email}</a></p><p>{r.phone}</p>
            {wa && <a className="link" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
            <p className="mt-4 text-xs text-muted">Customer link: <span className="break-all">{requestTrackUrl(r)}</span></p>
          </div>
          {order && <p>Order <Link className="link" href={`/admin/orders/${order.id}`}>{order.order_number}</Link> <OrderStatus status={order.status} /></p>}
          {can(user.role, 'custom.manage') && (
            <form action={requestNotesAction} className="grid gap-2">
              <input type="hidden" name="id" value={r.id} />
              <Field label="Internal notes" name="internal_notes" type="textarea" defaultValue={r.internal_notes} />
              <SubmitButton className="btn btn-outline btn-sm justify-self-start">Save notes</SubmitButton>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
