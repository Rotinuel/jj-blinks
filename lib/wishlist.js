// The signed-in customer's wishlist product ids, read once per request.
import { cache } from 'react';
import { getCurrentUser } from './auth.js';
import { query } from './db.js';

export const getWishlistIds = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return new Set();
  const rows = await query('SELECT product_id FROM wishlists WHERE user_id = $1', [user.id]);
  return new Set(rows.map((r) => Number(r.product_id)));
});
