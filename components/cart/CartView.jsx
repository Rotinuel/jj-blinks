'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useCart } from './CartProvider';
import { quoteAction } from '@/app/actions/checkout';
import { formatMoney } from '@/lib/currency';
import { Placeholder } from '@/components/ui/Photo';

export default function CartView() {
  const { items, ready, setQuantity, remove } = useCart();
  const [quote, setQuote] = useState(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!ready) return;
    if (!items.length) { setQuote(null); return; }
    start(async () => {
      try { setQuote(await quoteAction({ items })); setFailed(false); } catch { setFailed(true); }
    });
  }, [items, ready]);

  if (!ready) return <p className="py-16 text-muted">Loading your bag…</p>;
  if (!items.length) {
    return (
      <div className="py-16">
        <p className="font-display text-3xl">Your bag is empty.</p>
        <p className="mt-3 text-muted"><Link href="/shop" className="link">Browse the collection</Link> or <Link href="/custom-orders" className="link">request a custom piece</Link>.</p>
      </div>
    );
  }

  const byKey = new Map((quote?.lines || []).map((l) => [l.key, l]));
  const issueByKey = new Map((quote?.issues || []).map((i) => [i.key, i]));
  const blocking = (quote?.issues || []).length > 0;

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <ul className="divide-y divide-line border-y border-line lg:col-span-8" aria-busy={pending}>
        {items.map((it) => {
          const line = byKey.get(it.key);
          const issue = issueByKey.get(it.key);
          return (
            <li key={it.key} className="grid grid-cols-[5.5rem_1fr] gap-5 py-6 sm:grid-cols-[7rem_1fr]">
              <div className="relative aspect-[4/5] bg-ivory-deep">
                {line?.imageUrl ? <Image src={line.imageUrl} alt="" fill sizes="7rem" className="object-cover" /> : <Placeholder label="" />}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    {line ? <Link href={`/products/${line.slug}`} className="font-display text-xl hover:text-wine">{line.name}</Link> : <p className="font-display text-xl text-muted">{pending ? 'Checking…' : 'Unavailable item'}</p>}
                    {line?.variantLabel && <p className="text-sm text-muted">{line.variantLabel}</p>}
                    {Object.entries(it.customizations || {}).map(([k, v]) => <p key={k} className="text-sm text-muted">{v}</p>)}
                  </div>
                  {line && <p>{formatMoney(line.lineTotalKobo)}</p>}
                </div>
                {issue && <p className="error-text" role="alert">{issue.message}</p>}
                <div className="mt-auto flex items-center gap-4">
                  <label className="sr-only" htmlFor={`q-${it.key}`}>Quantity</label>
                  <select id={`q-${it.key}`} className="input w-20" value={it.quantity} onChange={(e) => setQuantity(it.key, Number(e.target.value))}>
                    {Array.from({ length: Math.max(10, it.quantity) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {line && <span className="text-sm text-muted">{formatMoney(line.unitPriceKobo)} each</span>}
                  <button type="button" className="link ml-auto text-sm" onClick={() => remove(it.key)}>Remove</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <aside className="lg:col-span-4">
        <div className="bg-ivory-deep p-6">
          <h2 className="font-display text-2xl">Summary</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{quote ? formatMoney(quote.subtotalKobo) : '—'}</dd></div>
            <div className="flex justify-between text-muted"><dt>Delivery</dt><dd>Calculated at checkout</dd></div>
          </dl>
          {quote?.display?.approx && (
            <p className="mt-3 text-xs text-muted">{formatMoney(quote.display.approx.amountMinor, quote.display.approx.currency, { approx: true })} — indicative conversion only.</p>
          )}
          {failed && <p className="error-text mt-4">We could not check prices just now. Refresh to try again.</p>}
          {blocking && <p className="error-text mt-4">Update the highlighted items to continue.</p>}
          <Link href="/checkout" aria-disabled={blocking || !quote} className={`btn btn-primary mt-6 w-full ${blocking || !quote ? 'pointer-events-none opacity-50' : ''}`}>
            Continue to checkout
          </Link>
          <p className="mt-4 text-xs text-muted">Prices are confirmed on our server at checkout. You can check out as a guest.</p>
        </div>
      </aside>
    </div>
  );
}
