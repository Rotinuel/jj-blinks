// Base seed — real business structure only. Safe to run repeatedly.
// Creates the product categories and the shipping zones the business named, with every
// delivery method set to "manual quotation" until the owner enters real rates in the admin.
// No products, prices, stock levels or rates are invented here. (Sample data: scripts/seed-dev.js)
import { query, one } from '../lib/db.js';
import { setupScriptDb } from './_setup.js';

const close = await setupScriptDb();

const categories = [
  ['Autogele', 'autogele', 'shop', 'Pre-tied gele, ready to wear.'],
  ['Turbans', 'turbans', 'shop', 'Structured and soft turbans.'],
  ['Fascinators', 'fascinators', 'shop', 'Occasion fascinators and hatinators.'],
  ['Zara Caps', 'zara-caps', 'shop', null],
  ["Traditional Men's Caps", 'traditional-mens-caps', 'shop', null],
  ['Stoning and Embellishments', 'stoning-and-embellishments', 'shop', 'Stone work and embellishment.'],
  ['Branded T-Shirts', 'branded-t-shirts', 'shop', null],
  ['Branded Polos', 'branded-polos', 'shop', null],
  ['Bridal and Occasion Headwear', 'bridal-and-occasion-headwear', 'shop', null],
  ['Custom Orders', 'custom-orders', 'service', 'Pieces made to your brief.'],
  ['Bulk and Corporate Orders', 'bulk-and-corporate-orders', 'service', 'Teams, events and asoebi groups.'],
];

for (const [i, [name, slug, kind, description]] of categories.entries()) {
  await query(
    `INSERT INTO categories (name, slug, kind, description, sort_order) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slug) DO NOTHING`,
    [name, slug, kind, description, i]
  );
}

const EUROPE = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE NO CH IS'.split(' ');
const zones = [
  { name: 'Nigeria', countries: ['NG'], sort: 0 },
  { name: 'United Kingdom', countries: ['GB'], sort: 1 },
  { name: 'United States', countries: ['US'], sort: 2 },
  { name: 'Canada', countries: ['CA'], sort: 3 },
  { name: 'Europe', countries: EUROPE, sort: 4 },
];

for (const z of zones) {
  await query('INSERT INTO shipping_zones (name, sort_order) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [z.name, z.sort]);
  const zone = await one('SELECT id FROM shipping_zones WHERE name = $1', [z.name]);
  for (const cc of z.countries) {
    await query('INSERT INTO shipping_zone_countries (zone_id, country_code) VALUES ($1, $2) ON CONFLICT DO NOTHING', [zone.id, cc]);
  }
  const has = await one('SELECT COUNT(*)::int AS n FROM shipping_methods WHERE zone_id = $1', [zone.id]);
  if (Number(has.n) === 0) {
    await query(
      `INSERT INTO shipping_methods (zone_id, name, type, description, sort_order)
       VALUES ($1, $2, 'quote', $3, 0)`,
      [
        zone.id,
        z.name === 'Nigeria' ? 'Delivery within Nigeria' : `Delivery to ${z.name}`,
        'Shipping is quoted for your address after you place the order. Nothing is charged until you approve the total.',
      ]
    );
    if (z.name === 'Nigeria') {
      await query(
        `INSERT INTO shipping_methods (zone_id, name, type, description, is_active, sort_order)
         VALUES ($1, 'Pickup — Olambe, Ogun', 'pickup', 'Collect from our Olambe location by arrangement.', FALSE, 1)`,
        [zone.id]
      );
    }
  }
}

// "Rest of world" exists but is OFF until the business confirms it can serve other destinations.
await query(
  `INSERT INTO shipping_zones (name, description, is_fallback, is_active, sort_order)
   VALUES ('Rest of world', 'Any destination not listed in another zone.', TRUE, FALSE, 9) ON CONFLICT (name) DO NOTHING`
);
const row = await one(`SELECT id FROM shipping_zones WHERE name = 'Rest of world'`);
const hasRow = await one('SELECT COUNT(*)::int AS n FROM shipping_methods WHERE zone_id = $1', [row.id]);
if (Number(hasRow.n) === 0) {
  await query(
    `INSERT INTO shipping_methods (zone_id, name, type, description) VALUES ($1, 'International delivery', 'quote',
       'We will confirm whether we can deliver to your address and quote the cost before you pay.')`,
    [row.id]
  );
}

console.log('Base data seeded: categories and shipping zones (manual-quote methods).');
await close();
