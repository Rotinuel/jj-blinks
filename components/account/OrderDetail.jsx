import { countryName } from '@/lib/countries';
import { formatMoney } from '@/lib/currency';
import { ORDER_STATUS_LABELS } from '@/lib/orders';
import { formatDateTime } from '@/lib/utilities';

/** Customer-facing order view shared by tracking links and the account area. */
export default function OrderDetail({ order, items, events, children }) {
  const a = order.shipping_address || {};
  const m = order.shipping_method || {};
  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <p className="text-sm text-muted">Placed {formatDateTime(order.created_at)}</p>
        <p className="mt-2 font-display text-3xl text-burgundy">{ORDER_STATUS_LABELS[order.status] || order.status}</p>
        {children}
        {order.tracking_number && (
          <div className="notice mt-6">
            <p>Carrier: {order.carrier || '—'}</p>
            <p>Tracking number: {order.tracking_number}</p>
            {order.tracking_url && /^https:\/\//.test(order.tracking_url) && (
              <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="link">Track with the carrier</a>
            )}
          </div>
        )}
        <h2 className="mt-12 font-display text-2xl">Progress</h2>
        <ol className="mt-4 border-l border-gold pl-6">
          {events.map((e, i) => (
            <li key={i} className="relative pb-6">
              <span className="absolute -left-[1.85rem] top-1.5 h-2.5 w-2.5 rounded-full bg-burgundy" aria-hidden="true" />
              <p className="text-sm text-muted">{formatDateTime(e.created_at)}</p>
              {e.status && <p className="font-medium">{ORDER_STATUS_LABELS[e.status] || e.status}</p>}
              {e.note && <p className="text-sm">{e.note}</p>}
            </li>
          ))}
        </ol>
      </div>
      <aside className="lg:col-span-5">
        <div className="bg-ivory-deep p-6">
          <h2 className="font-display text-2xl">Items</h2>
          <ul className="mt-4 divide-y divide-line text-sm">
            {items.map((i) => (
              <li key={i.id} className="py-3">
                <div className="flex justify-between gap-4"><span>{i.name}{i.variant_label ? `, ${i.variant_label}` : ''} × {i.quantity}</span><span>{formatMoney(i.line_total_kobo)}</span></div>
                {Object.entries(i.customizations || {}).filter(([k]) => !['request', 'quantity'].includes(k)).map(([k, v]) => <p key={k} className="text-muted">{String(v)}</p>)}
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(order.subtotal_kobo)}</dd></div>
            {order.discount_kobo > 0 && <div className="flex justify-between"><dt>Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}</dt><dd>−{formatMoney(order.discount_kobo)}</dd></div>}
            <div className="flex justify-between"><dt>Delivery</dt><dd>{order.shipping_kobo === null ? 'Awaiting quotation' : formatMoney(order.shipping_kobo)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-base"><dt>Total</dt><dd>{order.total_kobo === null ? '—' : formatMoney(order.total_kobo)}</dd></div>
            {order.charge_currency !== 'NGN' && order.charge_amount_minor && (
              <div className="flex justify-between text-muted"><dt>Charged in {order.charge_currency}</dt><dd>{formatMoney(order.charge_amount_minor, order.charge_currency)}</dd></div>
            )}
            {order.refunded_kobo > 0 && <div className="flex justify-between text-muted"><dt>Refunded</dt><dd>{formatMoney(order.refunded_kobo)}</dd></div>}
          </dl>
          <h3 className="mt-8 font-medium">Delivery</h3>
          <p className="mt-2 text-sm">{m.name}{m.estimate ? `, ${m.estimate}` : ''}</p>
          <address className="mt-2 text-sm not-italic text-muted">
            {a.full_name}<br />
            {a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />
            {[a.city, a.region, a.postal_code].filter(Boolean).join(', ')}<br />
            {countryName(a.country_code)}
          </address>
        </div>
      </aside>
    </div>
  );
}
