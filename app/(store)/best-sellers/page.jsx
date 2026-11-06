import Link from 'next/link';
import { bestSellers } from '@/db/queries/catalog';
import { getStoreContext } from '@/lib/storefront';
import { ProductGrid } from '@/components/products/ProductCard';

export const metadata = { title: 'Best sellers', alternates: { canonical: '/best-sellers' } };

export default async function BestSellersPage() {
  const [ctx, items] = await Promise.all([getStoreContext(), bestSellers(16)]);
  return (
    <div className="wrap pt-12">
      <h1 className="font-display text-title">Best sellers</h1>
      <p className="measure mt-3 text-muted">Ranked by paid orders over the last six months.</p>
      <div className="mt-12">
        {items.length ? (
          <ProductGrid products={items} ctx={ctx} priorityCount={5} back="/best-sellers" />
        ) : (
          <p className="py-12 text-muted">
            Best sellers appear here once orders come in. In the meantime, <Link href="/new-arrivals" className="link">see what is new</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
