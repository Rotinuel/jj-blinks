import Link from 'next/link';
import { Photo } from '@/components/ui/Photo';
import { HeartIcon } from '@/components/ui/icons';
import { formatMoney, indicativePrice } from '@/lib/currency';
import { getWishlistIds } from '@/lib/wishlist';
import { toggleWishlistAction } from '@/app/actions/account';

function percentOff(price, compare) {
  if (!compare || compare <= price) return null;
  return Math.round(((compare - price) / compare) * 100);
}

export async function ProductCard({ product, ctx, priority = false, back = '/' }) {
  const p = product;
  const wished = (await getWishlistIds()).has(Number(p.id));
  const compare = p.has_price_range ? null : p.compare_at_kobo;
  const off = percentOff(Number(p.from_price_kobo), Number(compare));
  const approx = ctx ? indicativePrice(p.from_price_kobo, ctx.currency, ctx.fx) : null;
  return (
    <article className="group relative">
      <Link href={`/products/${p.slug}`} className="block rounded-xl focus-visible:outline-offset-4">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-ivory-deep">
          <Photo src={p.image_url} alt={p.image_alt || p.name} sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 23vw, (min-width: 640px) 31vw, 46vw" priority={priority}
            placeholderLabel={`${p.name} photograph coming soon`} placeholderMark={p.name.replace(/^sample\s*[—-]\s*/i, '').charAt(0)}
            className="transition-transform duration-500 group-hover:scale-[1.04]" />
          {!p.in_stock && <span className="absolute bottom-2 left-2 rounded-full bg-charcoal/85 px-2.5 py-1 text-xs text-ivory">Sold out</span>}
          {p.is_sample && <span className="absolute left-2 top-2 rounded-full bg-gold px-2.5 py-1 text-xs text-charcoal">Sample</span>}
        </div>
        <h3 className="mt-2 truncate text-[0.92rem] leading-snug text-charcoal group-hover:underline">{p.name}</h3>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[0.92rem]">
          <span className={`font-semibold ${off ? 'text-ok' : ''}`}>{p.has_price_range && <span className="font-normal text-muted">From </span>}{formatMoney(p.from_price_kobo)}</span>
          {off && <><s className="text-xs text-muted">{formatMoney(compare)}</s><span className="text-xs text-muted">({off}% off)</span></>}
        </p>
        {approx && <p className="text-xs text-muted">≈ {formatMoney(approx.amountMinor, approx.currency)}</p>}
        {p.category_name && <p className="mt-0.5 truncate text-xs text-muted">{p.category_name}</p>}
      </Link>
      <form action={toggleWishlistAction} className="absolute right-2 top-2">
        <input type="hidden" name="productId" value={p.id} />
        <input type="hidden" name="slug" value={p.slug} />
        <input type="hidden" name="back" value={back} />
        <button
          aria-label={wished ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}
          aria-pressed={wished}
          className={`grid h-9 w-9 place-items-center rounded-full bg-white shadow-md transition-opacity hover:scale-105 ${wished ? 'text-burgundy' : 'text-charcoal md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100'}`}
        >
          <HeartIcon filled={wished} width={18} height={18} />
        </button>
      </form>
    </article>
  );
}

export function ProductGrid({ products, ctx, priorityCount = 0, back = '/', columns = 5 }) {
  const cols = columns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-4 xl:grid-cols-5';
  return (
    <div className={`grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 ${cols}`}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} ctx={ctx} priority={i < priorityCount} back={back} />)}
    </div>
  );
}

export function Pagination({ page, pages, makeHref }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <nav aria-label="Pagination" className="mt-14 flex items-center justify-center gap-1 text-sm">
      {page > 1 && <Link className="rounded-full px-4 py-2 hover:bg-ivory-deep" href={makeHref(page - 1)}>Previous</Link>}
      {nums.map((n) =>
        n === page ? (
          <span key={n} aria-current="page" className="grid h-9 w-9 place-items-center rounded-full bg-charcoal text-white">{n}</span>
        ) : (
          <Link key={n} href={makeHref(n)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-ivory-deep">{n}</Link>
        )
      )}
      {page < pages && <Link className="rounded-full px-4 py-2 hover:bg-ivory-deep" href={makeHref(page + 1)}>Next</Link>}
    </nav>
  );
}
