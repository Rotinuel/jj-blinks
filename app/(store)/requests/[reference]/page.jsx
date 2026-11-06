import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRequestForCustomer, REQUEST_STATUS_LABELS } from '@/lib/custom-requests';
import { acceptQuoteAction } from '@/app/actions/requests';
import { emailConfigured } from '@/lib/email';
import { formatMoney } from '@/lib/currency';
import { formatDate, formatDateTime, whatsappLink } from '@/lib/utilities';
import { getStoreContext } from '@/lib/storefront';

export const metadata = { title: 'Your request', robots: { index: false } };

export default async function RequestStatusPage({ params, searchParams }) {
  const { reference } = await params;
  const sp = await searchParams;
  const found = await getRequestForCustomer(decodeURIComponent(reference), sp.token);
  if (!found) notFound();
  const { req, events, files, order } = found;
  const { settings } = await getStoreContext();
  const expired = req.quote_valid_until && new Date(`${req.quote_valid_until}T23:59:59Z`) < new Date();
  const wa = whatsappLink(settings.store.whatsapp, `Hello JJ BLINKS, about my request ${req.reference}.`);
  return (
    <div className="wrap grid gap-12 pt-12 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <p className="text-sm text-muted">{req.kind === 'bulk' ? 'Bulk order request' : 'Custom order request'}</p>
        <h1 className="font-display text-title">{req.reference}</h1>
        {sp.new && (
          <p className="notice notice-ok mt-6">
            Request received. {emailConfigured() ? `We have emailed a copy to ${req.email}.` : 'Bookmark this page to follow your request.'} We will reply with a quotation.
          </p>
        )}
        {sp.error && <p className="notice notice-error mt-6" role="alert">{sp.error}</p>}
        <p className="mt-6 font-display text-3xl text-burgundy">{REQUEST_STATUS_LABELS[req.status]}</p>

        {req.status === 'quoted' && req.quote_kobo && (
          <section className="mt-8 border border-gold bg-white p-6">
            <h2 className="font-display text-2xl">Your quotation</h2>
            <p className="mt-3 text-3xl">{formatMoney(req.quote_kobo)}</p>
            {req.quote_valid_until && <p className="mt-1 text-sm text-muted">Valid until {formatDate(req.quote_valid_until)}</p>}
            {req.quote_notes && <p className="mt-4 whitespace-pre-line">{req.quote_notes}</p>}
            {expired ? (
              <p className="mt-6 text-sm">This quotation has expired. <Link href="/contact" className="link">Contact us</Link> for an updated price.</p>
            ) : (
              <form action={acceptQuoteAction} className="mt-6">
                <input type="hidden" name="reference" value={req.reference} />
                <input type="hidden" name="token" value={sp.token} />
                <button className="btn btn-primary">Accept and pay {formatMoney(req.quote_kobo)}</button>
                <p className="mt-2 text-xs text-muted">Accepting creates an order for this amount and takes you to Paystack.</p>
              </form>
            )}
          </section>
        )}
        {order && (
          <p className="mt-6">Order <Link className="link" href={`/track/${encodeURIComponent(order.order_number)}?token=${encodeURIComponent(order.tracking_token)}`}>{order.order_number}</Link> — view or pay.</p>
        )}

        <h2 className="mt-12 font-display text-2xl">Progress</h2>
        <ol className="mt-4 border-l border-gold pl-6">
          {events.map((e, i) => (
            <li key={i} className="pb-5">
              <p className="text-sm text-muted">{formatDateTime(e.created_at)}</p>
              {e.status && <p className="font-medium">{REQUEST_STATUS_LABELS[e.status]}</p>}
              {e.note && <p className="text-sm">{e.note}</p>}
            </li>
          ))}
        </ol>
      </div>
      <aside className="lg:col-span-5">
        <div className="bg-ivory-deep p-6 text-sm">
          <h2 className="font-display text-2xl">Your brief</h2>
          <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted">Product</dt><dd>{req.product_type}</dd>
            <dt className="text-muted">Quantity</dt><dd>{req.quantity}</dd>
            {req.occasion && <><dt className="text-muted">Occasion</dt><dd>{req.occasion}</dd></>}
            {req.colours && <><dt className="text-muted">Colours</dt><dd>{req.colours}</dd></>}
            {req.desired_date && <><dt className="text-muted">Needed by</dt><dd>{formatDate(req.desired_date)}</dd></>}
          </dl>
          <p className="mt-4 whitespace-pre-line">{req.style_description}</p>
          {files.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {files.map((f) => (
                <li key={f.url}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    {f.content_type === 'application/pdf' ? <span className="tag">PDF</span> : <img src={f.url} alt="Reference" className="h-16 w-16 object-cover" />}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="link mt-6 inline-block">Message us about this request</a>}
        </div>
      </aside>
    </div>
  );
}
