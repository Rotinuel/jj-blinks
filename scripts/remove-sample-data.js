// Remove everything created by seed-dev.js before going live.
import { query } from '../lib/db.js';
import { setupScriptDb } from './_setup.js';

const close = await setupScriptDb();
const blocked = await query(
  `SELECT DISTINCT o.order_number FROM order_items oi JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id WHERE p.is_sample`
);
if (blocked.length) {
  console.log(`Note: ${blocked.length} order(s) reference sample products; their order lines keep a snapshot of the item.`);
}
const p = await query('DELETE FROM products WHERE is_sample RETURNING id');
const m = await query(`DELETE FROM shipping_methods WHERE name LIKE '%(sample)' RETURNING id`);
const c = await query(`DELETE FROM coupons WHERE code = 'SAMPLE10' RETURNING id`);
console.log(`Removed ${p.length} sample product(s), ${m.length} sample shipping method(s), ${c.length} sample coupon(s).`);
await close();
