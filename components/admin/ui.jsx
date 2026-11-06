import Link from 'next/link';
import { ORDER_STATUS_LABELS } from '@/lib/orders';
import { REQUEST_STATUS_LABELS } from '@/lib/custom-requests';

export function Flash({ sp }) {
  if (sp?.ok) return <p className="notice notice-ok mb-6" role="status">{String(sp.ok)}</p>;
  if (sp?.error) return <p className="notice notice-error mb-6" role="alert">{String(sp.error)}</p>;
  if (sp?.denied) return <p className="notice notice-error mb-6" role="alert">Your role does not include access to that area.</p>;
  return null;
}

export function PageHead({ title, children, back }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back && <Link href={back.href} className="text-sm text-muted hover:text-wine">{back.label}</Link>}
        <h1 className="font-display text-4xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

const ORDER_TONE = { paid: 'tag-ok', processing: 'tag-ok', shipped: 'tag-ok', delivered: 'tag-ok', pending_payment: 'tag-warn', awaiting_quote: 'tag-warn', cancelled: '', expired: '', refunded: 'tag-wine', partially_refunded: 'tag-wine' };
export function OrderStatus({ status }) {
  return <span className={`tag ${ORDER_TONE[status] ?? ''}`}>{ORDER_STATUS_LABELS[status] || status}</span>;
}

const REQ_TONE = { new: 'tag-warn', reviewing: 'tag-warn', quoted: 'tag-wine', approved: 'tag-ok', in_production: 'tag-ok', ready: 'tag-ok', completed: '', rejected: '', cancelled: '' };
export function RequestStatus({ status }) {
  return <span className={`tag ${REQ_TONE[status] ?? ''}`}>{REQUEST_STATUS_LABELS[status] || status}</span>;
}

export function Stat({ label, value, href, note }) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </>
  );
  return href ? <Link href={href} className="block border-t border-line pt-4 hover:text-wine">{body}</Link> : <div className="border-t border-line pt-4">{body}</div>;
}

export function Field({ label, name, defaultValue, type = 'text', hint, required, children, className = '', ...rest }) {
  return (
    <div className={`field ${className}`}>
      <label className="label" htmlFor={name}>{label}</label>
      {children || (type === 'textarea'
        ? <textarea id={name} name={name} defaultValue={defaultValue ?? ''} className="input" required={required} {...rest} />
        : <input id={name} name={name} type={type} defaultValue={defaultValue ?? ''} className="input" required={required} {...rest} />)}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Pager({ page, pages, href }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex gap-4 text-sm" aria-label="Pagination">
      {page > 1 && <Link className="link" href={href(page - 1)}>Previous</Link>}
      <span className="text-muted">Page {page} of {pages}</span>
      {page < pages && <Link className="link" href={href(page + 1)}>Next</Link>}
    </nav>
  );
}
