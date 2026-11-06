// Storefront catalogue reads. Only published products are ever returned here.
import { one, query } from '../../lib/db.js';

export const SORTS = {
  featured: 'p.is_featured DESC, p.published_at DESC NULLS LAST, p.id DESC',
  newest: 'p.published_at DESC NULLS LAST, p.id DESC',
  price_asc: 'from_price_kobo ASC, p.id DESC',
  price_desc: 'from_price_kobo DESC, p.id DESC',
  name: 'p.name ASC',
};

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

const CARD_SELECT = `
  SELECT p.id, p.name, p.slug, p.short_description, p.price_kobo, p.compare_at_kobo, p.is_sample, p.is_featured,
         p.published_at, c.name AS category_name, c.slug AS category_slug,
         COALESCE(v.min_price, p.price_kobo) AS from_price_kobo,
         (v.cnt > 0 AND v.max_price <> v.min_price) AS has_price_range,
         CASE WHEN NOT p.track_inventory THEN TRUE
              WHEN v.cnt > 0 THEN v.stock_total > 0
              ELSE p.stock > 0 END AS in_stock,
         img.url AS image_url, img.alt AS image_alt, img2.url AS alt_image_url
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt, MIN(COALESCE(pv.price_kobo, p.price_kobo)) AS min_price,
             MAX(COALESCE(pv.price_kobo, p.price_kobo)) AS max_price, COALESCE(SUM(pv.stock), 0) AS stock_total
        FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active
    ) v ON TRUE
    LEFT JOIN LATERAL (SELECT url, alt FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) img ON TRUE
    LEFT JOIN LATERAL (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order, id OFFSET 1 LIMIT 1) img2 ON TRUE
   WHERE p.status = 'published'`;

/**
 * filters: { q, category, inStock, minKobo, maxKobo, sort, page, perPage, ids, featured, excludeId }
 */
export async function listProducts(filters = {}) {
  const params = [];
  const where = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };

  if (filters.category) where.push(`c.slug = ${add(filters.category)}`);
  if (filters.featured) where.push('p.is_featured');
  if (filters.ids?.length) where.push(`p.id = ANY(${add(filters.ids)}::bigint[])`);
  if (filters.excludeId) where.push(`p.id <> ${add(filters.excludeId)}`);
  if (filters.q) {
    const q = String(filters.q).trim().slice(0, 80);
    if (q) {
      const like = add(`%${escapeLike(q)}%`);
      const ts = add(q);
      where.push(`(p.name ILIKE ${like} OR p.sku ILIKE ${like} OR p.short_description ILIKE ${like}
                   OR c.name ILIKE ${like} OR EXISTS (SELECT 1 FROM unnest(p.tags) t WHERE t ILIKE ${like})
                   OR to_tsvector('simple', coalesce(p.name,'') || ' ' || coalesce(p.short_description,'') || ' ' || coalesce(p.sku,''))
                      @@ plainto_tsquery('simple', ${ts}))`);
    }
  }
  const outer = [];
  if (filters.inStock) outer.push('in_stock');
  if (Number.isFinite(filters.minKobo)) outer.push(`from_price_kobo >= ${add(filters.minKobo)}`);
  if (Number.isFinite(filters.maxKobo)) outer.push(`from_price_kobo <= ${add(filters.maxKobo)}`);

  const perPage = Math.min(Math.max(Number(filters.perPage) || 12, 1), 48);
  const page = Math.max(Number(filters.page) || 1, 1);
  const order = SORTS[filters.sort] || SORTS.featured;

  const sql = `
    SELECT *, COUNT(*) OVER() AS total_count FROM (
      ${CARD_SELECT} ${where.length ? 'AND ' + where.join(' AND ') : ''}
    ) p
    ${outer.length ? 'WHERE ' + outer.join(' AND ') : ''}
    ORDER BY ${order.replace(/p\.(is_featured|published_at|id|name)/g, '$1')}
    LIMIT ${add(perPage)} OFFSET ${add((page - 1) * perPage)}`;
  const rows = await query(sql, params);
  const total = rows.length ? Number(rows[0].total_count) : 0;
  return { items: rows, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function listCategories({ includeService = true } = {}) {
  return query(
    `SELECT c.id, c.name, c.slug, c.description, c.image_url, c.image_alt, c.kind, c.sort_order,
            (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id AND p.status = 'published') AS product_count
       FROM categories c
      WHERE c.is_active ${includeService ? '' : "AND c.kind = 'shop'"}
      ORDER BY c.sort_order, c.name`
  );
}

export async function getCategory(slug) {
  return one(
    `SELECT id, name, slug, description, image_url, image_alt, kind, seo_title, seo_description
       FROM categories WHERE slug = $1 AND is_active`,
    [slug]
  );
}

export async function getProductBySlug(slug) {
  const p = await one(
    `SELECT p.id, p.name, p.slug, p.sku, p.short_description, p.description, p.price_kobo, p.compare_at_kobo,
            p.stock, p.track_inventory, p.is_sample, p.tags, p.options, p.customization_options, p.materials, p.care,
            p.weight_grams, p.seo_title, p.seo_description, p.published_at, p.updated_at, p.category_id,
            c.name AS category_name, c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.slug = $1 AND p.status = 'published'`,
    [slug]
  );
  if (!p) return null;
  const [images, variants, reviewStats] = await Promise.all([
    query('SELECT id, url, alt FROM product_images WHERE product_id = $1 ORDER BY sort_order, id', [p.id]),
    query(
      `SELECT id, sku, option_values, price_kobo, compare_at_kobo, stock, sort_order
         FROM product_variants WHERE product_id = $1 AND is_active ORDER BY sort_order, id`,
      [p.id]
    ),
    one(
      `SELECT COUNT(*)::int AS count, ROUND(AVG(rating)::numeric, 1) AS average
         FROM reviews WHERE product_id = $1 AND status = 'approved'`,
      [p.id]
    ),
  ]);
  return { ...p, images, variants, reviewStats };
}

export async function listApprovedReviews(productId, limit = 20) {
  return query(
    `SELECT id, display_name, rating, title, body, verified_purchase, created_at
       FROM reviews WHERE product_id = $1 AND status = 'approved' ORDER BY created_at DESC LIMIT $2`,
    [productId, limit]
  );
}

export async function relatedProducts(product, limit = 4) {
  if (!product.category_slug) return [];
  const r = await listProducts({ category: product.category_slug, excludeId: product.id, perPage: limit, sort: 'featured' });
  return r.items;
}

export async function newArrivals(limit = 8) {
  return (await listProducts({ sort: 'newest', perPage: limit })).items;
}

export async function featuredProducts(limit = 8) {
  return (await listProducts({ featured: true, sort: 'featured', perPage: limit })).items;
}

/** Best sellers by verified paid quantity in the last 180 days. Empty when there are no sales yet. */
export async function bestSellers(limit = 8) {
  const top = await query(
    `SELECT oi.product_id, SUM(oi.quantity)::int AS qty
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status IN ('paid','partially_refunded') AND o.paid_at > NOW() - INTERVAL '180 days'
        AND oi.product_id IS NOT NULL
      GROUP BY oi.product_id ORDER BY qty DESC LIMIT $1`,
    [limit]
  );
  if (!top.length) return [];
  const ids = top.map((t) => Number(t.product_id));
  const { items } = await listProducts({ ids, perPage: limit });
  return ids.map((id) => items.find((i) => Number(i.id) === id)).filter(Boolean);
}

export async function allPublishedSlugs() {
  return query(`SELECT slug, updated_at FROM products WHERE status = 'published' ORDER BY id`);
}
