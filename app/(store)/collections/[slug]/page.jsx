import { notFound, redirect } from 'next/navigation';
import Listing from '@/components/products/Listing';
import { getCategory } from '@/db/queries/catalog';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const c = await getCategory(slug);
  if (!c) return {};
  return {
    title: c.seo_title || c.name,
    description: c.seo_description || c.description || `${c.name} from JJ BLINKS.`,
    alternates: { canonical: `/collections/${c.slug}` },
    openGraph: c.image_url ? { images: [c.image_url] } : undefined,
  };
}

export default async function CollectionPage({ params, searchParams }) {
  const { slug } = await params;
  const c = await getCategory(slug);
  if (!c) notFound();
  if (c.kind === 'service') redirect(c.slug === 'bulk-and-corporate-orders' ? '/bulk-orders' : '/custom-orders');
  return <Listing title={c.name} intro={c.description} basePath={`/collections/${c.slug}`} searchParams={await searchParams} fixed={{ category: c.slug }} />;
}
