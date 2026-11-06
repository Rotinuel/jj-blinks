'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Placeholder } from '@/components/ui/Photo';

export default function Gallery({ images, name }) {
  const [active, setActive] = useState(0);
  if (!images.length) {
    return <div className="relative aspect-[4/5] w-full"><Placeholder label="Product photograph coming soon" /></div>;
  }
  const current = images[Math.min(active, images.length - 1)];
  return (
    <div className="grid gap-3 md:grid-cols-[4.5rem_1fr]">
      <div className="relative order-1 aspect-[4/5] w-full overflow-hidden bg-ivory-deep md:order-2">
        <Image key={current.url} src={current.url} alt={current.alt || name} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      </div>
      {images.length > 1 && (
        <ul className="order-2 flex gap-2 overflow-x-auto md:order-1 md:flex-col" aria-label="Product images">
          {images.map((img, i) => (
            <li key={img.id ?? img.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-current={i === active}
                className={`relative block aspect-[4/5] w-16 overflow-hidden md:w-full ${i === active ? 'outline outline-1 outline-burgundy' : 'opacity-70 hover:opacity-100'}`}
              >
                <Image src={img.url} alt="" fill sizes="5rem" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
