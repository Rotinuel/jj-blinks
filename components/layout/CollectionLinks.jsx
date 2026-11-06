'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronIcon } from '@/components/ui/icons';

/**
 * Category link row. All links stay in one line: when they don't fit, the row can be swiped
 * (or scrolled with the arrow buttons that appear at whichever edge has more links).
 * items: [{ href, label, accent }]
 */
export default function CollectionLinks({ items }) {
  const rowRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    document.fonts?.ready.then(update).catch(() => {});
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); ro.disconnect(); };
  }, [items, update]);

  const scroll = (dir) => {
    const el = rowRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  const arrow = (dir) => (
    <div className={`pointer-events-none absolute inset-y-0 ${dir < 0 ? 'left-0 bg-gradient-to-r' : 'right-0 bg-gradient-to-l'} flex w-16 items-center from-white via-white/90 to-transparent ${dir < 0 ? 'justify-start' : 'justify-end'}`}>
      <button
        type="button"
        onClick={() => scroll(dir)}
        aria-label={dir < 0 ? 'Show previous categories' : 'Show more categories'}
        className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full border border-line bg-white shadow-md hover:bg-ivory-deep"
      >
        <ChevronIcon className={dir < 0 ? 'rotate-90' : '-rotate-90'} />
      </button>
    </div>
  );

  return (
    <div className="relative">
      <ul ref={rowRef} className="flex overflow-x-auto scroll-smooth text-sm [scrollbar-width:none] [justify-content:safe_center] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => (
          <li key={it.href} className="shrink-0">
            <Link href={it.href} className={`block whitespace-nowrap rounded-full px-3 py-1.5 hover:bg-ivory-deep ${it.accent ? 'text-burgundy' : ''}`}>{it.label}</Link>
          </li>
        ))}
      </ul>
      {edges.left && arrow(-1)}
      {edges.right && arrow(1)}
    </div>
  );
}
