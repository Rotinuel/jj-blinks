import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { getOrderAdmin } from '@/db/queries/admin';
import { ADMIN_TRANSITIONS } from '@/lib/order-admin';
import { ORDER_STATUS_LABELS, orderTrackUrl } from '@/lib/orders';
import { countryName } from '@/lib/countries';
import { formatMoney } from '@/lib/currency';
import { formatDateTime, whatsappLink } from '@/lib/utilities';
import { clearAttentionAction, orderNoteAction, quoteShippingAction, reconcileAction, refundAction, updateStatusAction } from '@/app/actions/admin/orders';
import { Field, Flash, OrderStatus, PageHead } from '@/components/admin/ui';
import SubmitButton from '@/components/admin/SubmitButton';

export const metadata = { title: 'Order' };

export default async function OrderAdmin({ params, searchParams }) {
  const user = await requirePermission('orders.view');
  const { id } = await params;
  const sp = await searchParams;
  const data = await getOrderAdmin(Number(id));
  if (!data) notFound();
  const { order: o, items, events, payments, refunds, customer } = data;
  const a = o.shipping_address || {};
  const next = ADMIN_TRANSITIONS[o.status] || [];
  const canUpdate = can(user.role, 'orders.update');
  const refundable = ['paid', 'partially_refunded'].includes(o.payment_status) && can(user.role, 'orders.refund');
  const wa = whatsappLink(a.phone || o.phone, `Hello ${o.customer_name}, this is JJ BLINKS about your order ${o.order_number}.`);

  return (
    <>
      <PageHead title={o.order_number} back={{ href: '/admin/orders', label: 'Orders' }}>
        <OrderStatus status={o.status} />
        <span className="tag">{o.payment_status}</span>
      </PageHead>
      <Flash sp={sp} />
      {o.needs_attention && (
        <div className="notice notice-error mb-6">
          <p className="font-medium">Needs attention</p><p>{o.attention_note}</p>
          {canUpdate && (
            <form action={clearAttentionAction} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="id" value={o.id} />
              <input name="resolution" placeholder="What was done" className="input max-w-sm" />
              <SubmitButton className="btn btn-outline btn-sm">Mark reviewed</SubmitButton>
            </form>
          )}
        </div>
      )}
      <div className="grid gap-10 xl:grid-cols-[1.6fr_1fr]">
        <div className="grid gap-10">
          <section>
            <h2 className="mb-3 font-display text-2xl">Items</h2>
            <table className="table"><thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th className="text-right">Line</th></tr></thead>
              <tbody>{items.map((i) => (
                <tr key={i.id}>
                  <td>{i.product_id ? <Link className="link" href={`/admin/products/${i.product_id}`}>{i.name}</Link> : i.name}{i.variant_label && <span className="text-muted">, {i.variant_label}</span>}
                    {Object.entries(i.customizations || {}).map(([k, v]) => <p key={k} className="text-xs text-muted">{k}: {String(v)}</p>)}</td>
                  <td className="text-sm">{i.sku}</td><td>{i.quantity} × {formatMoney(i.unit_price_kobo)}</td><td className="text-right">{formatMoney(i.line_total_kobo)}</td>
                </tr>
              ))}</tbody>
            </table>
            <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(o.subtotal_kobo)}</dd></div>
              <div className="flex justify-between"><dt>Discount {o.coupon_code && `(${o.coupon_code})`}</dt><dd>−{formatMoney(o.discount_kobo)}</dd></div>
              <div className="flex justify-between"><dt>Delivery</dt><dd>{o.shipping_kobo === null ? 'Not quoted' : formatMoney(o.shipping_kobo)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1 font-medium"><dt>Total</dt><dd>{o.total_kobo === null ? '—' : formatMoney(o.total_kobo)}</dd></div>
              {o.charge_currency !== 'NGN' && <div className="flex justify-between text-muted"><dt>Charged</dt><dd>{formatMoney(o.charge_amount_minor, o.charge_currency)} @ {o.charge_fx?.rate}</dd></div>}
              {o.refunded_kobo > 0 && <div className="flex justify-between text-danger"><dt>Refunded</dt><dd>{formatMoney(o.refunded_kobo)}</dd></div>}
            </dl>
          </section>

          {canUpdate && o.status === 'awaiting_quote' && (
            <section className="border border-gold p-5">
              <h2 className="font-display text-2xl">Quote shipping</h2>
              <p className="mt-1 text-sm text-muted">Method: {o.shipping_method?.name} to {countryName(a.country_code)}. The customer gets a payment link for the new total.</p>
              <form action={quoteShippingAction} className="mt-4 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={o.id} />
                <Field label="Shipping cost (₦)" name="shipping" inputMode="decimal" required />
                <Field label="Note to customer (optional)" name="note" />
                <SubmitButton>Send quote</SubmitButton>
              </form>
            </section>
          )}

          {canUpdate && next.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-2xl">Update fulfilment</h2>
              <form action={updateStatusAction} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={o.id} />
                <Field label="New status" name="status"><select id="status" name="status" className="input" required>{next.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}</select></Field>
                <Field label="Carrier" name="carrier" defaultValue={o.carrier} />
                <Field label="Tracking number" name="tracking_number" defaultValue={o.tracking_number} />
                <Field label="Carrier tracking link (https://…)" name="tracking_url" defaultValue={o.tracking_url} />
                <Field label="Note to customer (optional)" name="note" className="sm:col-span-2" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked /> Email the customer</label>
                <SubmitButton>Update order</SubmitButton>
              </form>
              {next.includes('cancelled') && <p className="mt-2 text-xs text-muted">Cancelling returns reserved stock. A paid order still needs a refund.</p>}
            </section>
          )}

          {refundable && (
            <section>
              <h2 className="mb-3 font-display text-2xl">Refund</h2>
              <form action={refundAction} className="grid gap-4 sm:grid-cols-3">
                <input type="hidden" name="id" value={o.id} />
                <Field label="Amount (₦)" name="amount" inputMode="decimal" required defaultValue={((o.total_kobo - o.refunded_kobo) / 100).toFixed(2)} />
                <Field label="Reason" name="reason" />
                <Field label="Method" name="method"><select id="method" name="method" className="input"><option value="paystack">Refund through Paystack</option><option value="manual">Record a refund made elsewhere</option></select></Field>
                <SubmitButton className="btn btn-outline text-danger" confirm="Issue this refund? This cannot be undone.">Refund</SubmitButton>
              </form>
              {refunds.length > 0 && <ul className="mt-4 text-sm">{refunds.map((r) => <li key={r.id}>{formatDateTime(r.created_at)}: {formatMoney(r.amount_kobo)} via {r.method} ({r.status}) {r.reason && `— ${r.reason}`} {r.actor_name && `by ${r.actor_name}`}</li>)}</ul>}
            </section>
          )}

          <section>
            <h2 className="mb-3 font-display text-2xl">History</h2>
            <ol className="space-y-3 border-l border-gold pl-5 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="text-muted">{formatDateTime(e.created_at)}</span> {e.status && <strong>{ORDER_STATUS_LABELS[e.status] || e.status}</strong>} {e.note}
                  {!e.visible_to_customer && <span className="tag ml-2">Internal</span>} {e.actor_name && <span className="text-muted">— {e.actor_name}</span>}
                </li>
              ))}
            </ol>
            {canUpdate && (
              <form action={orderNoteAction} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={o.id} />
                <Field label="Add a note" name="note" className="min-w-72 flex-1" />
                <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="visible" /> Show to customer</label>
                <SubmitButton className="btn btn-outline btn-sm mb-1">Add note</SubmitButton>
              </form>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-8 text-sm">
          <section className="bg-ivory-deep p-5">
            <h2 className="font-display text-xl">Customer</h2>
            <p className="mt-2">{o.customer_name}{customer && <> · <Link className="link" href={`/admin/customers/${customer.id}`}>account</Link></>}</p>
            <p><a className="link" href={`mailto:${o.email}`}>{o.email}</a></p>
            <p>{o.phone}</p>
            {wa && <a className="link" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp the customer</a>}
            <h3 className="mt-5 font-medium">Deliver to</h3>
            <address className="not-italic">{a.full_name}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{[a.city, a.region, a.postal_code].filter(Boolean).join(', ')}<br />{countryName(a.country_code)}<br />{a.phone}</address>
            <p className="mt-2">Method: {o.shipping_method?.name}{o.shipping_method?.zone ? ` (${o.shipping_method.zone})` : ''}</p>
            {o.delivery_instructions && <p className="mt-2">Instructions: {o.delivery_instructions}</p>}
            <p className="mt-4 text-xs text-muted">Customer link: <span className="break-all">{orderTrackUrl(o)}</span></p>
          </section>
          <section>
            <h2 className="font-display text-xl">Payments</h2>
            {payments.length ? (
              <ul className="mt-2 space-y-2">{payments.map((p) => (
                <li key={p.reference} className="border-b border-line pb-2">
                  <p className="break-all font-mono text-xs">{p.reference}</p>
                  <p>{p.status} · {formatMoney(p.amount_minor, p.currency)} {p.channel && `· ${p.channel}`}</p>
                  {p.gateway_response && <p className="text-xs text-muted">{p.gateway_response}</p>}
                </li>
              ))}</ul>
            ) : <p className="mt-2 text-muted">No payment attempts.</p>}
            {payments.some((p) => p.status === 'initialized') && (
              <form action={reconcileAction} className="mt-3"><input type="hidden" name="id" value={o.id} /><SubmitButton className="btn btn-outline btn-sm" pendingText="Checking…">Check with Paystack</SubmitButton></form>
            )}
          </section>
          <section className="text-xs text-muted">
            <p>Placed {formatDateTime(o.created_at)}</p>
            {o.paid_at && <p>Paid {formatDateTime(o.paid_at)}</p>}
            {o.expires_at && <p>Reservation expires {formatDateTime(o.expires_at)}</p>}
            {o.display_currency !== 'NGN' && <p>Customer browsed in {o.display_currency}</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
