import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProductBySlug, listApprovedReviews, relatedProducts } from '@/db/queries/catalog';
import { getStoreContext } from '@/lib/storefront';
import { getCurrentUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { appUrl, formatDate, truncate, whatsappLink } from '@/lib/utilities';
import Gallery from '@/components/products/Gallery';
import AddToBag from '@/components/products/AddToBag';
import { ProductGrid } from '@/components/products/ProductCard';
import { ReviewForm, WishlistButton } from '@/components/account/ProductActions';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return {};
  const description = p.seo_description || truncate(p.short_description || p.description || `${p.name} from JJ BLINKS.`, 155);
  return {
    title: p.seo_title || p.name,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { title: p.name, description, images: p.images.slice(0, 1).map((i) => ({ url: i.url, alt: i.alt || p.name })) },
    robots: p.is_sample ? { index: false } : undefined,
  };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) notFound();
  const [ctx, user, reviews, related] = await Promise.all([getStoreContext(), getCurrentUser(), listApprovedReviews(p.id), relatedProducts(p)]);
  const [wished, purchased] = user
    ? await Promise.all([
        one('SELECT 1 AS x FROM wishlists WHERE user_id = $1 AND product_id = $2', [user.id, p.id]),
        one(
          `SELECT 1 AS x FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE o.user_id = $1 AND oi.product_id = $2 AND o.payment_status IN ('paid','partially_refunded') LIMIT 1`,
          [user.id, p.id]
        ),
      ])
    : [null, null];

  const url = appUrl(`/products/${p.slug}`);
  const wa = whatsappLink(ctx.settings.store.whatsapp, `Hello JJ BLINKS, I'm interested in "${p.name}" (${p.sku}): ${url}`);
  const prices = p.variants.length ? p.variants.map((v) => v.price_kobo ?? p.price_kobo) : [p.price_kobo];
  const inStock = !p.track_inventory || (p.variants.length ? p.variants.some((v) => v.stock > 0) : p.stock > 0);
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      sku: p.sku,
      description: truncate(p.description || p.short_description || p.name, 500),
      image: p.images.map((i) => i.url),
      brand: { '@type': 'Brand', name: 'JJ BLINKS' },
      category: p.category_name || undefined,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'NGN',
        lowPrice: (Math.min(...prices) / 100).toFixed(2),
        highPrice: (Math.max(...prices) / 100).toFixed(2),
        offerCount: prices.length,
        availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url,
      },
      ...(p.reviewStats?.count > 0
        ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: String(p.reviewStats.average), reviewCount: p.reviewStats.count } }
        : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Shop', item: appUrl('/shop') },
        ...(p.category_slug ? [{ '@type': 'ListItem', position: 2, name: p.category_name, item: appUrl(`/collections/${p.category_slug}`) }] : []),
        { '@type': 'ListItem', position: p.category_slug ? 3 : 2, name: p.name, item: url },
      ],
    },
  ];

  return (
    <div className="wrap pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap gap-2">
          <li><Link href="/shop" className="hover:text-wine">Shop</Link> /</li>
          {p.category_slug && <li><Link href={`/collections/${p.category_slug}`} className="hover:text-wine">{p.category_name}</Link> /</li>}
          <li aria-current="page" className="text-charcoal">{p.name}</li>
        </ol>
      </nav>

      {p.is_sample && <p className="notice mb-6">Sample product for testing the store. It does not describe a real JJ BLINKS piece.</p>}

      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7"><Gallery images={p.images} name={p.name} /></div>
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <h1 className="font-display text-4xl leading-tight sm:text-5xl">{p.name}</h1>
            {p.short_description && <p className="mt-4 text-muted">{p.short_description}</p>}
            {p.reviewStats?.count > 0 && (
              <p className="mt-3 text-sm"><a href="#reviews" className="link">{p.reviewStats.average} out of 5 from {p.reviewStats.count} {p.reviewStats.count === 1 ? 'review' : 'reviews'}</a></p>
            )}
            <div className="mt-8">
              <AddToBag
                product={{
                  id: p.id, price_kobo: p.price_kobo, compare_at_kobo: p.compare_at_kobo, stock: p.stock, track_inventory: p.track_inventory,
                  options: p.options, variants: p.variants, customization_options: p.customization_options,
                }}
                currency={ctx.currency}
                fx={ctx.fx}
                whatsappHref={wa}
              />
            </div>
            <div className="mt-4">
              <WishlistButton productId={p.id} slug={p.slug} signedIn={Boolean(user)} wished={Boolean(wished)} />
            </div>

            <div className="mt-10 divide-y divide-line border-y border-line text-sm">
              {p.description && (
                <details className="group py-4" open>
                  <summary className="cursor-pointer list-none font-medium">Description</summary>
                  <div className="mt-3 whitespace-pre-line text-muted">{p.description}</div>
                </details>
              )}
              {(p.materials || p.care) && (
                <details className="py-4">
                  <summary className="cursor-pointer list-none font-medium">Materials and care</summary>
                  {p.materials && <p className="mt-3 whitespace-pre-line text-muted">{p.materials}</p>}
                  {p.care && <p className="mt-3 whitespace-pre-line text-muted">{p.care}</p>}
                </details>
              )}
              <details className="py-4">
                <summary className="cursor-pointer list-none font-medium">Shipping, customs and returns</summary>
                <div className="mt-3 space-y-3 text-muted">
                  <p>We deliver within Nigeria and to selected countries. Delivery options and costs for your address are shown at checkout before you pay; some destinations need a shipping quotation first.</p>
                  {ctx.settings.shipping.processing_note && <p>{ctx.settings.shipping.processing_note}</p>}
                  <p>{ctx.settings.shipping.customs_notice}</p>
                  <p><Link href="/shipping" className="link">Shipping details</Link> · <Link href="/returns" className="link">Returns</Link></p>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>

      <section id="reviews" className="mt-24 grid gap-10 border-t border-line pt-12 lg:grid-cols-12" aria-labelledby="reviews-title">
        <div className="lg:col-span-4">
          <h2 id="reviews-title" className="font-display text-3xl">Reviews</h2>
          <p className="mt-2 text-sm text-muted">Reviews come from customers who bought this piece and are checked before they appear.</p>
          <div className="mt-6">
            <ReviewForm productId={p.id} slug={p.slug} signedIn={Boolean(user)} purchased={Boolean(purchased)} />
          </div>
        </div>
        <div className="lg:col-span-7 lg:col-start-6">
          {reviews.length ? (
            <ul className="divide-y divide-line">
              {reviews.map((r) => (
                <li key={r.id} className="py-6">
                  <p className="text-sm" aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}<span className="text-line">{'★'.repeat(5 - r.rating)}</span></p>
                  {r.title && <p className="mt-2 font-display text-xl">{r.title}</p>}
                  <p className="mt-2 whitespace-pre-line">{r.body}</p>
                  <p className="mt-3 text-xs text-muted">{r.display_name}{r.verified_purchase ? ', verified purchase' : ''}, {formatDate(r.created_at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No reviews yet.</p>
          )}
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-24" aria-labelledby="related-title">
          <h2 id="related-title" className="mb-10 font-display text-title">From the same collection</h2>
          <ProductGrid products={related} ctx={ctx} back={`/products/${p.slug}`} />
        </section>
      )}
    </div>
  );
}
