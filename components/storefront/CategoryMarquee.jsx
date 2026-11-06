import Link from 'next/link';
import { Photo } from '@/components/ui/Photo';

/**
 * Round category tiles that scroll sideways on their own in a seamless loop.
 * The list is rendered twice and the track moves by exactly one copy's width.
 * Pauses on hover or keyboard focus; with reduced motion it becomes a normal scrollable row.
 */
export default function CategoryMarquee({ collections }) {
  if (!collections.length) return null;
  const seconds = Math.max(20, collections.length * 4.5);

  const tiles = (copy) =>
    collections.map((c) => (
      <li key={`${copy}-${c.slug}`} className="mr-5 w-[6.5rem] shrink-0 sm:mr-8 sm:w-[7.5rem]">
        <Link href={`/collections/${c.slug}`} tabIndex={copy ? -1 : undefined} className="group block text-center">
          <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-full bg-white ring-1 ring-line transition-shadow group-hover:shadow-lg group-hover:ring-burgundy/40">
            <Photo src={c.image_url} alt={copy ? '' : c.image_alt || c.name} sizes="8rem"
              placeholderLabel={`${c.name} photograph coming soon`} placeholderMark={c.name.charAt(0)}
              className="transition-transform duration-500 group-hover:scale-105" />
          </div>
          <p className="mt-2 text-sm font-medium leading-tight group-hover:underline">{c.name}</p>
        </Link>
      </li>
    ));

  return (
    <div className="marquee mt-8" style={{ '--marquee-duration': `${seconds}s` }}>
      <div className="marquee-track">
        <ul className="flex" aria-label="Collections">{tiles(0)}</ul>
        <ul className="marquee-copy flex" aria-hidden="true">{tiles(1)}</ul>
      </div>
    </div>
  );
}
