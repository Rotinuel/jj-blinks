'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * Category link row that always fits its width: it shows as many links as fit and leaves
 * the rest out (they remain reachable from the Categories menu, the homepage tiles and the
 * mobile menu). Widths are measured from a hidden copy of the row, so it adapts to the
 * screen size, the font and the number of collections.
 * items: [{ href, label, accent }]
 */
export default function CollectionLinks({ items }) {
  const wrapRef = useRef(null);
  const measureRef = useRef(null);
  const [visible, setVisible] = useState(items.length);

  useEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;
    const calc = () => {
      const avail = wrap.clientWidth;
      let used = 0;
      let n = 0;
      for (const el of measure.children) {
        const w = el.getBoundingClientRect().width;
        if (used + w > avail) break;
        used += w;
        n++;
      }
      setVisible(n);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(wrap);
    window.addEventListener('resize', calc);
    document.fonts?.ready.then(calc).catch(() => {});
    return () => { ro.disconnect(); window.removeEventListener('resize', calc); };
  }, [items]);

  const linkClass = (accent) => `block whitespace-nowrap rounded-full px-3 py-1.5 hover:bg-ivory-deep ${accent ? 'text-burgundy' : ''}`;

  return (
    <div ref={wrapRef} className="relative">
      {/* Hidden copy used only for measuring. */}
      <ul ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex h-0 overflow-hidden text-sm">
        {items.map((it) => <li key={it.href} className="shrink-0"><span className={linkClass(false)}>{it.label}</span></li>)}
      </ul>

      <ul className="flex justify-center overflow-hidden text-sm">
        {items.slice(0, visible).map((it) => (
          <li key={it.href} className="shrink-0"><Link href={it.href} className={linkClass(it.accent)}>{it.label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
