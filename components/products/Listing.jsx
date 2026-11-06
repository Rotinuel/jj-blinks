import Link from 'next/link';
import { listProducts, SORTS } from '@/db/queries/catalog';
import { getNavCategories, getStoreContext } from '@/lib/storefront';
import { parseNairaToKobo } from '@/lib/currency';
import { ProductGrid, Pagination } from './ProductCard';

const SORT_LABELS = { featured: 'Featured', newest: 'Newest', price_asc: 'Price, low to high', price_desc: 'Price, high to low', name: 'Name' };

function one(v) {
  return Array.isArray(v) ? v[0] : v;
}

/** Reads filters from search params; `fixed` overrides (e.g. the category on a collection page). */
export function readFilters(sp, fixed = {}) {
  const q = (one(sp.q) || '').toString().slice(0, 80);
  const sort = Object.hasOwn(SORTS, one(sp.sort)) ? one(sp.sort) : fixed.sort || 'featured';
  const min = parseNairaToKobo(one(sp.min));
  const max = parseNairaToKobo(one(sp.max));
  return {
    q,
    sort,
    category: fixed.category || (one(sp.category) || '').toString().slice(0, 80) || null,
    inStock: one(sp.available) === '1',
    minKobo: min ?? undefined,
    maxKobo: max ?? undefined,
    page: Math.max(1, Number.parseInt(one(sp.page), 10) || 1),
    perPage: 20,
    raw: { min: one(sp.min) || '', max: one(sp.max) || '' },
  };
}

export default async function Listing({ title, intro, basePath, searchParams, fixed = {}, showSearch = false, showCategories = false, emptyText }) {
  const sp = searchParams;
  const f = readFilters(sp, fixed);
  const [ctx, result, categories] = await Promise.all([
    getStoreContext(),
    listProducts(f),
    showCategories ? getNavCategories() : Promise.resolve([]),
  ]);
  const makeHref = (page) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== 'page' && v) p.set(k, one(v));
    if (page > 1) p.set('page', String(page));
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const filtered = f.q || f.inStock || f.raw.min || f.raw.max || (!fixed.category && f.category);

  return (
    <div className="wrap pt-12">
      <header className="mb-10 grid gap-4 md:grid-cols-12 md:items-end">
        <div className="md:col-span-7">
          <h1 className="font-display text-title">{title}</h1>
          {intro && <p className="measure mt-3 text-muted">{intro}</p>}
        </div>
        <p className="text-sm text-muted md:col-span-5 md:text-right" aria-live="polite">
          {result.total} {result.total === 1 ? 'piece' : 'pieces'}{f.q ? ` for “${f.q}”` : ''}
        </p>
      </header>

      <form method="get" action={basePath} className="mb-10 grid gap-4 rounded-2xl bg-ivory-deep/70 p-5 sm:grid-cols-2 lg:grid-cols-[2fr_1.3fr_1fr_1fr_1.3fr_auto] lg:items-end">
        {(showSearch || f.q) && (
          <div className="field">
            <label className="label" htmlFor="q">Search</label>
            <input id="q" name="q" type="search" defaultValue={f.q} className="input" placeholder="Autogele, turban, cap…" />
          </div>
        )}
        {showCategories && (
          <div className="field">
            <label className="label" htmlFor="category">Collection</label>
            <select id="category" name="category" defaultValue={f.category || ''} className="input">
              <option value="">All collections</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="min">Min price (₦)</label>
          <input id="min" name="min" inputMode="numeric" defaultValue={f.raw.min} className="input" />
        </div>
        <div className="field">
          <label className="label" htmlFor="max">Max price (₦)</label>
          <input id="max" name="max" inputMode="numeric" defaultValue={f.raw.max} className="input" />
        </div>
        <div className="field">
          <label className="label" htmlFor="sort">Sort</label>
          <select id="sort" name="sort" defaultValue={f.sort} className="input">
            {Object.entries(SORT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4 lg:pb-2.5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="available" value="1" defaultChecked={f.inStock} className="accent-burgundy" /> In stock
          </label>
          <button className="btn btn-primary btn-sm">Apply</button>
          {filtered && <Link href={basePath} className="link text-sm">Clear</Link>}
        </div>
      </form>

      {result.items.length ? (
        <>
          <ProductGrid products={result.items} ctx={ctx} priorityCount={5} back={basePath} />
          <Pagination page={result.page} pages={result.pages} makeHref={makeHref} />
        </>
      ) : (
        <div className="py-16 text-center">
          <p className="font-display text-2xl">{filtered ? 'Nothing matches those filters.' : emptyText || 'New pieces are on their way.'}</p>
          <p className="mt-3 text-muted">
            {filtered ? <Link href={basePath} className="link">Clear the filters</Link> : <>Looking for something specific? <Link href="/custom-orders" className="link">Request a custom piece</Link>.</>}
          </p>
        </div>
      )}
    </div>
  );
}
