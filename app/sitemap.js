import { allPublishedSlugs, listCategories } from '@/db/queries/catalog';
import { appUrl } from '@/lib/utilities';

export const dynamic = 'force-dynamic';

export default async function sitemap() {
  const [products, cats] = await Promise.all([allPublishedSlugs(), listCategories({ includeService: false })]);
  const fixed = ['', '/shop', '/new-arrivals', '/best-sellers', '/custom-orders', '/bulk-orders', '/about', '/contact', '/faqs', '/shipping', '/returns', '/privacy', '/terms'];
  return [
    ...fixed.map((p) => ({ url: appUrl(p || '/'), changeFrequency: 'weekly', priority: p === '' ? 1 : 0.6 })),
    ...cats.map((c) => ({ url: appUrl(`/collections/${c.slug}`), changeFrequency: 'weekly', priority: 0.7 })),
    ...products.map((p) => ({ url: appUrl(`/products/${p.slug}`), lastModified: p.updated_at, changeFrequency: 'weekly', priority: 0.8 })),
  ];
}
