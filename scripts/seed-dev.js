// DEVELOPMENT SAMPLE DATA — not real JJ BLINKS products or prices.
// Every product created here has is_sample = TRUE and is badged "Sample" in the storefront.
// Sample shipping rates are named "(sample)". Remove everything with: bun run db:remove-samples
import { json, one, query } from '../lib/db.js';
import { setupScriptDb } from './_setup.js';

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to load sample data with NODE_ENV=production. Pass --force if you really mean it.');
  process.exit(1);
}
const close = await setupScriptDb();

const cat = async (slug) => (await one('SELECT id FROM categories WHERE slug = $1', [slug]))?.id;
if (!(await cat('autogele'))) {
  console.error('Run `bun run db:seed` first.');
  process.exit(1);
}

const samples = [
  {
    cat: 'autogele', name: 'Sample — Damask Autogele', sku: 'SMP-AG-001', price: 2500000, stock: null, featured: true,
    short: 'Development sample. Replace with a real product in the admin.',
    options: [{ name: 'Colour', values: ['Wine', 'Gold', 'Ivory'] }],
    variants: [['Wine', 4], ['Gold', 2], ['Ivory', 0]],
    custom: [{ key: 'gele_note', label: 'Notes for the stylist', type: 'text', required: false, max_length: 200 }],
    weight: 400,
  },
  {
    cat: 'turbans', name: 'Sample — Velvet Turban', sku: 'SMP-TB-001', price: 1500000, stock: 6, featured: true,
    short: 'Development sample. Replace with a real product in the admin.', weight: 250,
  },
  {
    cat: 'fascinators', name: 'Sample — Feather Fascinator', sku: 'SMP-FS-001', price: 1800000, stock: 3,
    short: 'Development sample. Replace with a real product in the admin.', weight: 200,
  },
  {
    cat: 'traditional-mens-caps', name: 'Sample — Embroidered Fila', sku: 'SMP-MC-001', price: 1200000, stock: null,
    short: 'Development sample. Replace with a real product in the admin.',
    options: [{ name: 'Size', values: ['56', '58', '60'] }],
    variants: [['56', 2], ['58', 5], ['60', 1]],
    weight: 150,
  },
  {
    cat: 'branded-polos', name: 'Sample — Branded Polo', sku: 'SMP-PL-001', price: 900000, stock: null,
    short: 'Development sample. Replace with a real product in the admin.',
    options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }],
    variants: [['S', 10], ['M', 10], ['L', 10], ['XL', 5]],
    custom: [{ key: 'print_text', label: 'Text to print', type: 'text', required: true, max_length: 40 }],
    weight: 300,
  },
  {
    cat: 'bridal-and-occasion-headwear', name: 'Sample — Bridal Crown Gele', sku: 'SMP-BR-001', price: 4500000, stock: 2,
    short: 'Development sample. Replace with a real product in the admin.', weight: null,
  },
];

for (const s of samples) {
  const exists = await one('SELECT id FROM products WHERE sku = $1', [s.sku]);
  if (exists) continue;
  const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const p = await one(
    `INSERT INTO products (category_id, name, slug, sku, short_description, description, price_kobo, stock, status, is_featured,
                           options, customization_options, weight_grams, is_sample, published_at, materials, care)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'published',$9,$10,$11,$12,TRUE,NOW(),$13,$14) RETURNING id`,
    [
      await cat(s.cat), s.name, slug, s.sku, s.short,
      'This is development sample content used to exercise the storefront, cart and checkout. It does not describe a real JJ BLINKS product.',
      s.price, s.stock ?? 0, Boolean(s.featured), json(s.options || []), json(s.custom || []), s.weight,
      'Sample materials text.', 'Sample care text.',
    ]
  );
  for (const [i, [value, stock]] of (s.variants || []).entries()) {
    await query(
      `INSERT INTO product_variants (product_id, sku, option_values, stock, sort_order) VALUES ($1, $2, $3, $4, $5)`,
      [p.id, `${s.sku}-${value.toUpperCase().replace(/[^A-Z0-9]/g, '')}`, json({ [s.options[0].name]: value }), stock, i]
    );
  }
}

// Sample rates so automatic shipping can be exercised locally.
const ng = await one(`SELECT id FROM shipping_zones WHERE name = 'Nigeria'`);
const gb = await one(`SELECT id FROM shipping_zones WHERE name = 'United Kingdom'`);
if (ng && !(await one(`SELECT id FROM shipping_methods WHERE zone_id = $1 AND name LIKE '%(sample)'`, [ng.id]))) {
  await query(
    `INSERT INTO shipping_methods (zone_id, name, type, flat_rate_kobo, free_over_kobo, est_days_min, est_days_max, description, sort_order)
     VALUES ($1, 'Standard delivery (sample)', 'flat', 300000, 10000000, 2, 5, 'Sample rate for development only.', -1)`,
    [ng.id]
  );
}
if (gb && !(await one(`SELECT id FROM shipping_methods WHERE zone_id = $1 AND name LIKE '%(sample)'`, [gb.id]))) {
  await query(
    `INSERT INTO shipping_methods (zone_id, name, type, rate_table, est_days_min, est_days_max, description, sort_order)
     VALUES ($1, 'Courier by weight (sample)', 'weight', $2, 5, 10, 'Sample rate for development only.', -1)`,
    [gb.id, json([{ max_grams: 1000, rate_kobo: 2500000 }, { max_grams: 3000, rate_kobo: 4500000 }])]
  );
}
await query(
  `INSERT INTO coupons (code, description, type, value, min_subtotal_kobo, usage_limit)
   VALUES ('SAMPLE10', 'Development sample coupon', 'percent', 10, 0, 100) ON CONFLICT (code) DO NOTHING`
);

console.log('Development sample data loaded (products marked as samples, sample rates, coupon SAMPLE10).');
await close();
