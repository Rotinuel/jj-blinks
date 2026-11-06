import Link from 'next/link';
import { getNavCategories, getStoreContext } from '@/lib/storefront';
import { bestSellers, featuredProducts, newArrivals } from '@/db/queries/catalog';
import { Photo } from '@/components/ui/Photo';
import { ProductGrid } from '@/components/products/ProductCard';
import CategoryMarquee from '@/components/storefront/CategoryMarquee';
import { whatsappLink } from '@/lib/utilities';

export const metadata = { alternates: { canonical: '/' } };

// Facts about how this shop works (no invented claims about the business).
const PROMISES = [
  ['Made for your occasion', 'Ready-to-wear pieces, or a custom piece made to your brief and quoted before you pay.', '/custom-orders', 'How custom orders work'],
  ['Pay securely', 'Card and bank payments are handled by Paystack. Your order is confirmed only once payment is verified.', '/faqs', 'Payment questions'],
  ['Delivered in Nigeria and abroad', 'Delivery options and costs for your address are shown before you pay.', '/shipping', 'Shipping & customs'],
];

const OCCASION_TONES = ['bg-burgundy text-ivory', 'bg-rose-tint text-charcoal', 'bg-charcoal text-ivory', 'bg-ivory-deep text-charcoal'];

function SectionHead({ title, href, linkText, sub }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-title">{title}</h2>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {href && <Link href={href} className="rounded-full px-4 py-2 text-sm font-medium hover:bg-ivory-deep">{linkText} <span aria-hidden="true">›</span></Link>}
    </div>
  );
}

export default async function HomePage() {
  const ctx = await getStoreContext();
  const [collections, arrivals, best, featured] = await Promise.all([
    getNavCategories(), newArrivals(10), bestSellers(10), featuredProducts(10),
  ]);
  const h = ctx.settings.home;
  const wa = whatsappLink(ctx.settings.store.whatsapp, 'Hello JJ BLINKS, I would like to discuss a custom order.');
  const curated = best.length ? { title: 'Best sellers', sub: 'Most ordered over the last six months', href: '/best-sellers', items: best } : featured.length ? { title: 'Our picks', items: featured } : null;
  const [headline1, ...rest] = String(h.hero.headline || '').match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()) || [h.hero.headline];

  return (
    <>
      {/* Welcome band + round category tiles */}
      <section className="bg-rose-tint/70 pb-10 pt-10 sm:pt-12">
        <div className="wrap text-center">
          <h1 className="mx-auto max-w-3xl font-display text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] leading-tight text-charcoal">
            {headline1}{rest.length > 0 && <> <span className="italic text-burgundy">{rest.join(' ')}</span></>}
          </h1>
          {h.hero.subheading && <p className="mx-auto mt-3 max-w-xl text-[0.95rem] text-muted">{h.hero.subheading}</p>}
        </div>
        <CategoryMarquee collections={collections} />
      </section>

      {/* Promo cards */}
      <section className="wrap mt-10 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="grid overflow-hidden rounded-3xl bg-burgundy text-ivory sm:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col justify-center p-7 sm:p-10">
            <h2 className="font-display text-[clamp(1.7rem,1.2rem+1.6vw,2.5rem)] leading-tight">{h.custom_feature.heading}</h2>
            <p className="mt-3 max-w-sm text-sm text-ivory/80">{h.custom_feature.text}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/custom-orders" className="btn btn-light">Request a custom piece</Link>
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-sm underline-offset-4 hover:underline">Chat on WhatsApp</a>}
            </div>
          </div>
          <div className="relative min-h-56">
            <Photo src={h.custom_feature.image_url || h.hero.image_url} alt={h.custom_feature.image_alt || h.hero.image_alt} sizes="(min-width: 1024px) 28vw, 100vw" priority dark
              placeholderLabel="Custom work photograph coming soon" placeholderMark="JJ" />
          </div>
        </div>
        <div className="grid overflow-hidden rounded-3xl bg-charcoal text-ivory sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-[1fr_auto]">
          <div className="relative min-h-44">
            <Photo src={h.apparel.image_url} alt={h.apparel.image_alt} sizes="(min-width: 1024px) 30vw, 100vw" dark placeholderLabel="Branded apparel photograph coming soon" placeholderMark="B" />
          </div>
          <div className="p-7">
            <h2 className="font-display text-2xl leading-tight">{h.apparel.heading}</h2>
            <p className="mt-2 text-sm text-ivory/75">{h.apparel.text}</p>
            <Link href="/bulk-orders" className="btn btn-light btn-sm mt-5">Get a bulk quotation</Link>
          </div>
        </div>
      </section>

      {/* New in */}
      {arrivals.length > 0 && (
        <section className="wrap mt-16" aria-labelledby="new-title">
          <div id="new-title"><SectionHead title="New in" href="/new-arrivals" linkText="See all" sub="The latest pieces from the studio" /></div>
          <ProductGrid products={arrivals} ctx={ctx} back="/" />
        </section>
      )}

      {/* Shop by occasion: editorial mosaic */}
      {h.occasions?.length > 0 && (
        <section className="wrap mt-16" aria-labelledby="occasions-title">
          <div id="occasions-title"><SectionHead title="Dressed for the occasion" /></div>
          <ul className={`grid gap-4 sm:grid-cols-2 ${h.occasions.length >= 3 ? 'lg:grid-cols-[1.25fr_1fr]' : ''}`}>
            {h.occasions.map((o, i) => (
              <li key={o.title} className={i === 0 && h.occasions.length >= 3 ? `sm:col-span-2 lg:col-span-1 ${h.occasions.length === 3 ? 'lg:row-span-2' : 'lg:row-span-3'}` : ''}>
                <Link href={o.href || '/shop'} className={`group flex h-full min-h-40 flex-col justify-end rounded-3xl p-7 ${OCCASION_TONES[i % OCCASION_TONES.length]} ${i === 0 ? 'lg:min-h-[24rem]' : ''}`}>
                  <h3 className={`font-display leading-tight group-hover:underline ${i === 0 ? 'text-3xl' : 'text-2xl'}`}>{o.title}</h3>
                  {o.text && <p className="mt-2 max-w-sm text-sm opacity-80">{o.text}</p>}
                  <span className="mt-4 text-sm font-medium">Shop now <span aria-hidden="true">›</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Curated */}
      {curated && (
        <section className="wrap mt-16" aria-labelledby="curated-title">
          <div id="curated-title"><SectionHead title={curated.title} sub={curated.sub} href={curated.href} linkText="See all" /></div>
          <ProductGrid products={curated.items} ctx={ctx} back="/" />
        </section>
      )}

      {/* Why shop with us */}
      <section className="mt-20 bg-ivory-deep py-14" aria-labelledby="why-title">
        <div className="wrap">
          <h2 id="why-title" className="text-center font-display text-title">Why shop with JJ BLINKS</h2>
          <ul className="mx-auto mt-10 grid max-w-5xl gap-10 text-center md:grid-cols-3">
            {PROMISES.map(([title, text, href, cta]) => (
              <li key={title}>
                <h3 className="font-display text-xl">{title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{text}</p>
                <Link href={href} className="mt-3 inline-block text-sm font-medium underline underline-offset-4 hover:text-burgundy">{cta}</Link>
              </li>
            ))}
          </ul>
          <p className="mt-12 text-center text-sm">
            <Link href="/about" className="underline underline-offset-4 hover:text-burgundy">Read our story</Link>
          </p>
        </div>
      </section>
    </>
  );
}
