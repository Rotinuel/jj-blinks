'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '@/components/cart/CartProvider';
import { setCurrencyAction } from '@/app/actions/store';
import { BagIcon, MenuIcon } from '@/components/ui/icons';

export function BagLink() {
  const { count, ready } = useCart();
  return (
    <Link href="/cart" aria-label={ready && count ? `Bag, ${count} items` : 'Bag'} className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-ivory-deep">
      <BagIcon />
      {ready && count > 0 && (
        <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-burgundy px-1 text-[11px] leading-none text-ivory">
          {count}
        </span>
      )}
    </Link>
  );
}

export function CurrencySelect({ currency, currencies, enabled }) {
  if (!enabled) return null;
  return (
    <form action={setCurrencyAction} className="flex items-center">
      <label htmlFor="currency" className="sr-only">Display currency</label>
      <select
        id="currency"
        name="currency"
        defaultValue={currency}
        onChange={(e) => e.currentTarget.form.requestSubmit()}
        className="cursor-pointer rounded-full bg-transparent px-2 py-2 text-sm hover:bg-ivory-deep"
      >
        {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <noscript><button className="text-sm underline">Set</button></noscript>
    </form>
  );
}

/** Desktop "Categories" button with a panel of collections. */
export function CategoriesMenu({ collections }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative hidden lg:block">
      <button type="button" aria-expanded={open} aria-controls="categories-panel" onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm hover:bg-ivory-deep">
        <MenuIcon width={18} height={18} /> Categories
      </button>
      {open && (
        <div id="categories-panel" className="absolute left-0 top-full z-40 mt-2 w-72 rounded-2xl border border-line bg-white p-2 shadow-xl">
          <ul>
            {collections.map((c) => (
              <li key={c.slug}>
                <Link href={`/collections/${c.slug}`} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-ivory-deep">
                  <span>{c.name}</span>
                  {c.product_count > 0 && <span className="text-xs text-muted">{c.product_count}</span>}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            <Link href="/shop" className="block rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-ivory-deep">Shop everything</Link>
            <Link href="/custom-orders" className="block rounded-xl px-3 py-2.5 text-sm text-burgundy hover:bg-ivory-deep">Request a custom piece</Link>
            <Link href="/bulk-orders" className="block rounded-xl px-3 py-2.5 text-sm text-burgundy hover:bg-ivory-deep">Bulk & corporate orders</Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function MobileMenu({ links, collections }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const dialog = useRef(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" className="grid h-10 w-10 place-items-center rounded-full hover:bg-ivory-deep lg:hidden" aria-label="Menu" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(true)}>
        <MenuIcon />
      </button>
      <dialog
        id="mobile-menu"
        ref={dialog}
        onClose={() => setOpen(false)}
        className="m-0 h-dvh max-h-none w-[min(22rem,88vw)] max-w-none bg-white p-0 text-charcoal backdrop:bg-charcoal/50"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="font-display text-xl tracking-[0.18em] text-burgundy">JJ BLINKS</span>
          <button type="button" className="rounded-full px-3 py-1.5 text-sm hover:bg-ivory-deep" onClick={() => setOpen(false)}>Close</button>
        </div>
        <nav className="px-3 py-4" aria-label="Mobile">
          <ul className="space-y-0.5">
            {links.map((l) => <li key={l.href}><Link href={l.href} className="block rounded-xl px-3 py-2.5 font-medium hover:bg-ivory-deep">{l.label}</Link></li>)}
          </ul>
          <p className="mt-5 px-3 text-xs text-muted">Categories</p>
          <ul className="mt-1 space-y-0.5">
            {collections.map((c) => <li key={c.slug}><Link href={`/collections/${c.slug}`} className="block rounded-xl px-3 py-2.5 hover:bg-ivory-deep">{c.name}</Link></li>)}
          </ul>
          <ul className="mt-5 space-y-0.5 border-t border-line pt-3 text-sm">
            <li><Link href="/account" className="block rounded-xl px-3 py-2.5 hover:bg-ivory-deep">Your account</Link></li>
            <li><Link href="/account/wishlist" className="block rounded-xl px-3 py-2.5 hover:bg-ivory-deep">Wishlist</Link></li>
            <li><Link href="/track" className="block rounded-xl px-3 py-2.5 hover:bg-ivory-deep">Track an order</Link></li>
            <li><Link href="/contact" className="block rounded-xl px-3 py-2.5 hover:bg-ivory-deep">Contact</Link></li>
          </ul>
        </nav>
      </dialog>
    </>
  );
}

