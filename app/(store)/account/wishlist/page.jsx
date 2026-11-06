import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { listProducts } from '@/db/queries/catalog';
import { getStoreContext } from '@/lib/storefront';
import { ProductGrid } from '@/components/products/ProductCard';

export const metadata = { title: 'Wishlist' };

export default async function WishlistPage() {
  const user = await requireUser('/account/wishlist');
  const ids = (await query('SELECT product_id FROM wishlists WHERE user_id = $1 ORDER BY created_at DESC', [user.id])).map((r) => Number(r.product_id));
  const [ctx, list] = await Promise.all([getStoreContext(), ids.length ? listProducts({ ids, perPage: 48 }) : { items: [] }]);
  return (
    <>
      <h1 className="font-display text-title">Wishlist</h1>
      <div className="mt-8">
        {list.items.length ? <ProductGrid products={list.items} ctx={ctx} back="/account/wishlist" /> : <p className="text-muted">Nothing saved yet. Use “Save to wishlist” on any piece. <Link href="/shop" className="link">Browse the collection</Link>.</p>}
      </div>
    </>
  );
}
