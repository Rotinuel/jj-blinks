'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronIcon } from '@/components/ui/icons';

/**
 * Category link row that always fits its width: links that don't fit move into a "More"
 * menu at the end. Widths are measured from a hidden copy of the row, so it adapts to the
 * screen size, the font and the number of collections.
 * items: [{ href, label, accent }]
 */
export default function CollectionLinks({ items }) {
  const wrapRef = useRef(null);
  const measureRef = useRef(null);
  const menuRef = useRef(null);
  const [visible, setVisible] = useState(items.length);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;
    const calc = () => {
      const avail = wrap.clientWidth;
      const widths = [...measure.children].map((el) => el.getBoundingClientRect().width);
      const moreWidth = widths.pop();
      if (widths.reduce((a, b) => a + b, 0) <= avail) return setVisible(items.length);
      let used = moreWidth;
      let n = 0;
      for (const w of widths) {
        if (used + w > avail) break;
        used += w;
        n++;
      }
      setVisible(n);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(wrap);
    document.fonts?.ready.then(calc).catch(() => {});
    return () => ro.disconnect();
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const linkClass = (accent) => `block whitespace-nowrap rounded-full px-3 py-1.5 hover:bg-ivory-deep ${accent ? 'text-burgundy' : ''}`;
  const shown = items.slice(0, visible);
  const hidden = items.slice(visible);

  return (
    <div ref={wrapRef} className="relative">
      {/* Hidden copy used only for measuring. */}
      <ul ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex h-0 overflow-hidden text-sm">
        {items.map((it) => <li key={it.href} className="shrink-0"><span className={linkClass(false)}>{it.label}</span></li>)}
        <li className="shrink-0"><span className={`${linkClass(false)} inline-flex items-center gap-1`}>More <ChevronIcon /></span></li>
      </ul>

      <ul className="flex justify-center overflow-hidden text-sm">
        {shown.map((it) => (
          <li key={it.href} className="shrink-0"><Link href={it.href} className={linkClass(it.accent)}>{it.label}</Link></li>
        ))}
        {hidden.length > 0 && (
          <li ref={menuRef} className="relative shrink-0">
            <button type="button" aria-expanded={open} aria-controls="more-collections" onClick={() => setOpen((o) => !o)}
              className={`${linkClass(false)} inline-flex items-center gap-1`}>
              More <ChevronIcon className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <ul id="more-collections" className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-line bg-white p-2 shadow-xl">
                {hidden.map((it) => (
                  <li key={it.href}>
                    <Link href={it.href} className={`block rounded-xl px-3 py-2.5 hover:bg-ivory-deep ${it.accent ? 'text-burgundy' : ''}`}>{it.label}</Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
