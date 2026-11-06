'use server';

import { revalidatePath } from 'next/cache';
import { adminAction, UserError } from '@/lib/admin-action';
import { json, one, query, transaction } from '@/lib/db';
import { parseNairaToKobo } from '@/lib/currency';
import { can } from '@/lib/permissions';
import { cleanString } from '@/lib/validation';
import { slugify } from '@/lib/utilities';
import { audit } from '@/lib/audit';
import { deleteFile } from '@/lib/storage';
import { parseCustomizations, parseOptions } from '@/lib/product-form';

function money(formData, name, { required = false } = {}) {
  const raw = String(formData.get(name) ?? '').trim();
  if (!raw) {
    if (required) throw new UserError('Enter a price.');
    return null;
  }
  const k = parseNairaToKobo(raw);
  if (k === null) throw new UserError(`Enter a valid amount for ${name.replace(/_/g, ' ')} (e.g. 25000).`);
  return k;
}

function int(formData, name, fallback = 0) {
  const n = Number.parseInt(formData.get(name), 10);
  return Number.isSafeInteger(n) ? n : fallback;
}

export async function saveProductAction(formData) {
  const id = Number(formData.get('id')) || null;
  await adminAction('products.edit', id ? `/admin/products/${id}` : '/admin/products/new', async (user) => {
    const name = cleanString(formData.get('name'), 160);
    if (!name) throw new UserError('Name is required.');
    const slug = slugify(formData.get('slug') || name);
    const sku = cleanString(formData.get('sku'), 60).toUpperCase();
    if (!sku) throw new UserError('SKU is required.');
    const status = ['draft', 'published', 'archived'].includes(formData.get('status')) ? formData.get('status') : 'draft';
    const price = money(formData, 'price', { required: true });
    const compare = money(formData, 'compare_at');
    if (compare !== null && compare <= price) throw new UserError('The comparison price must be higher than the price, or left empty.');
    const canCost = can(user.role, 'products.cost');
    const cost = canCost ? money(formData, 'cost') : undefined;
    const weight = String(formData.get('weight_grams') || '').trim() ? int(formData, 'weight_grams', null) : null;
    const tags = String(formData.get('tags') || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20);
    const fields = [
      Number(formData.get('category_id')) || null, name, slug, sku, cleanString(formData.get('short_description'), 300) || null,
      cleanString(formData.get('description'), 8000) || null, price, compare, Math.max(0, int(formData, 'stock')),
      formData.get('track_inventory') === 'on', Math.max(0, int(formData, 'low_stock_threshold', 3)), status,
      formData.get('is_featured') === 'on', tags, json(parseOptions(formData.get('options'))),
      json(parseCustomizations(formData.get('customizations'))), cleanString(formData.get('materials'), 2000) || null,
      cleanString(formData.get('care'), 2000) || null, weight, cleanString(formData.get('seo_title'), 70) || null,
      cleanString(formData.get('seo_description'), 160) || null,
    ];
    let saved;
    if (id) {
      saved = await one(
        `UPDATE products SET category_id=$2, name=$3, slug=$4, sku=$5, short_description=$6, description=$7, price_kobo=$8,
                compare_at_kobo=$9, stock=$10, track_inventory=$11, low_stock_threshold=$12, status=$13, is_featured=$14, tags=$15,
                options=$16, customization_options=$17, materials=$18, care=$19, weight_grams=$20, seo_title=$21, seo_description=$22,
                published_at = CASE WHEN $13 = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END
          WHERE id = $1 RETURNING id, slug, stock`,
        [id, ...fields]
      );
      if (!saved) throw new UserError('Product not found.');
      if (cost !== undefined) await query('UPDATE products SET cost_kobo = $2 WHERE id = $1', [id, cost]);
    } else {
      saved = await one(
        `INSERT INTO products (category_id, name, slug, sku, short_description, description, price_kobo, compare_at_kobo, stock,
                              track_inventory, low_stock_threshold, status, is_featured, tags, options, customization_options,
                              materials, care, weight_grams, seo_title, seo_description, published_at, cost_kobo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, CASE WHEN $12 = 'published' THEN NOW() END, $22)
         RETURNING id, slug`,
        [...fields, cost ?? null]
      );
      if (fields[8] > 0) {
        await query(`INSERT INTO inventory_movements (product_id, change, reason, actor_id, note) VALUES ($1, $2, 'restock', $3, 'Opening stock')`, [saved.id, fields[8], user.id]);
      }
    }
    await audit(user, id ? 'product.update' : 'product.create', { entityType: 'product', entityId: saved.id, details: { name, status, price_kobo: price } });
    revalidatePath('/', 'layout');
    return { ok: id ? 'Product saved.' : 'Product created. Add photos and variants below.', path: `/admin/products/${saved.id}` };
  });
}

export async function deleteProductAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('products.delete', `/admin/products/${id}`, async (user) => {
    const images = await query('SELECT url FROM product_images WHERE product_id = $1', [id]);
    const p = await one('DELETE FROM products WHERE id = $1 RETURNING name', [id]);
    if (!p) throw new UserError('Product not found.');
    for (const i of images) { await deleteFile(i.url); await query('DELETE FROM media_assets WHERE url = $1', [i.url]); }
    await audit(user, 'product.delete', { entityType: 'product', entityId: id, details: { name: p.name } });
    revalidatePath('/', 'layout');
    return { ok: `Deleted ${p.name}. Past orders keep their copy of the item.`, path: '/admin/products' };
  });
}

export async function generateVariantsAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('products.edit', `/admin/products/${id}`, async (user) => {
    const p = await one('SELECT sku, options FROM products WHERE id = $1', [id]);
    const opts = (p?.options || []).filter((o) => o.values?.length);
    if (!opts.length) throw new UserError('Add options (e.g. "Colour: Gold, Wine") and save the product first.');
    let combos = [{}];
    for (const o of opts) combos = combos.flatMap((c) => o.values.map((v) => ({ ...c, [o.name]: v })));
    if (combos.length > 100) throw new UserError('That would create more than 100 variants. Reduce the option values.');
    const existing = await query('SELECT option_values FROM product_variants WHERE product_id = $1', [id]);
    const have = new Set(existing.map((e) => JSON.stringify(Object.entries(e.option_values).sort())));
    let created = 0;
    for (const [i, c] of combos.entries()) {
      if (have.has(JSON.stringify(Object.entries(c).sort()))) continue;
      const suffix = Object.values(c).map((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)).join('-');
      await query(
        `INSERT INTO product_variants (product_id, sku, option_values, stock, sort_order) VALUES ($1, $2, $3, 0, $4)`,
        [id, `${p.sku}-${suffix}`.slice(0, 60), json(c), i]
      );
      created++;
    }
    await audit(user, 'product.variants_generated', { entityType: 'product', entityId: id, details: { created } });
    return { ok: created ? `${created} variant(s) added with zero stock. Set their stock below.` : 'All option combinations already exist.' };
  });
}

export async function saveVariantAction(formData) {
  const productId = Number(formData.get('product_id'));
  const id = Number(formData.get('id'));
  await adminAction('products.edit', `/admin/products/${productId}`, async (user) => {
    const price = money(formData, 'price');
    const compare = money(formData, 'compare_at');
    const sku = cleanString(formData.get('sku'), 60).toUpperCase();
    if (!sku) throw new UserError('Variant SKU is required.');
    const newStock = Math.max(0, int(formData, 'stock'));
    await transaction(async (tx) => {
      const v = await tx.one('SELECT stock, price_kobo FROM product_variants WHERE id = $1 AND product_id = $2 FOR UPDATE', [id, productId]);
      if (!v) throw new UserError('Variant not found.');
      const base = await tx.one('SELECT price_kobo FROM products WHERE id = $1', [productId]);
      const effective = price ?? Number(base.price_kobo);
      if (compare !== null && compare <= effective) throw new UserError('Comparison price must be higher than the variant price.');
      await tx.query(
        `UPDATE product_variants SET sku = $2, price_kobo = $3, compare_at_kobo = $4, stock = $5, is_active = $6 WHERE id = $1`,
        [id, sku, price, compare, newStock, formData.get('is_active') === 'on']
      );
      if (newStock !== Number(v.stock)) {
        await tx.query(
          `INSERT INTO inventory_movements (product_id, variant_id, change, reason, actor_id) VALUES ($1, $2, $3, 'adjustment', $4)`,
          [productId, id, newStock - Number(v.stock), user.id]
        );
      }
    });
    await audit(user, 'variant.update', { entityType: 'variant', entityId: id });
    revalidatePath('/', 'layout');
    return { ok: 'Variant saved.' };
  });
}

export async function deleteVariantAction(formData) {
  const productId = Number(formData.get('product_id'));
  await adminAction('products.edit', `/admin/products/${productId}`, async (user) => {
    await query('DELETE FROM product_variants WHERE id = $1 AND product_id = $2', [Number(formData.get('id')), productId]);
    await audit(user, 'variant.delete', { entityType: 'product', entityId: productId });
    revalidatePath('/', 'layout');
    return { ok: 'Variant removed.' };
  });
}

export async function imageAction(formData) {
  const productId = Number(formData.get('product_id'));
  const imageId = Number(formData.get('image_id'));
  const op = String(formData.get('op'));
  await adminAction('products.edit', `/admin/products/${productId}`, async (user) => {
    if (op === 'alt') {
      await query('UPDATE product_images SET alt = $3 WHERE id = $1 AND product_id = $2', [imageId, productId, cleanString(formData.get('alt'), 200) || null]);
    } else if (op === 'up' || op === 'down' || op === 'first') {
      await transaction(async (tx) => {
        const imgs = await tx.query('SELECT id FROM product_images WHERE product_id = $1 ORDER BY sort_order, id FOR UPDATE', [productId]);
        const ids = imgs.map((i) => Number(i.id));
        const i = ids.indexOf(imageId);
        if (i < 0) return;
        ids.splice(i, 1);
        const to = op === 'first' ? 0 : op === 'up' ? Math.max(0, i - 1) : Math.min(ids.length, i + 1);
        ids.splice(to, 0, imageId);
        for (const [n, iid] of ids.entries()) await tx.query('UPDATE product_images SET sort_order = $2 WHERE id = $1', [iid, n]);
      });
    } else if (op === 'delete') {
      const img = await one('DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING url', [imageId, productId]);
      if (img) { await deleteFile(img.url); await query('DELETE FROM media_assets WHERE url = $1', [img.url]); }
      await audit(user, 'product.image_delete', { entityType: 'product', entityId: productId });
    }
    revalidatePath('/', 'layout');
    return { ok: op === 'delete' ? 'Image deleted.' : 'Images updated.' };
  });
}

export async function saveCategoryAction(formData) {
  const id = Number(formData.get('id')) || null;
  await adminAction('categories.manage', '/admin/categories', async (user) => {
    const name = cleanString(formData.get('name'), 80);
    if (!name) throw new UserError('Name is required.');
    const vals = [
      name, slugify(formData.get('slug') || name), cleanString(formData.get('description'), 500) || null,
      formData.get('kind') === 'service' ? 'service' : 'shop', int(formData, 'sort_order'), formData.get('is_active') === 'on',
      cleanString(formData.get('image_alt'), 200) || null, cleanString(formData.get('seo_title'), 70) || null,
      cleanString(formData.get('seo_description'), 160) || null,
    ];
    if (id) {
      await query(
        `UPDATE categories SET name=$2, slug=$3, description=$4, kind=$5, sort_order=$6, is_active=$7, image_alt=$8, seo_title=$9, seo_description=$10 WHERE id=$1`,
        [id, ...vals]
      );
    } else {
      await query(
        `INSERT INTO categories (name, slug, description, kind, sort_order, is_active, image_alt, seo_title, seo_description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        vals
      );
    }
    await audit(user, id ? 'category.update' : 'category.create', { entityType: 'category', entityId: id, details: { name } });
    revalidatePath('/', 'layout');
    return { ok: 'Collection saved.' };
  });
}

export async function deleteCategoryAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('categories.manage', '/admin/categories', async (user) => {
    const c = await one('DELETE FROM categories WHERE id = $1 RETURNING name, image_url', [id]);
    if (c?.image_url) { await deleteFile(c.image_url); await query('DELETE FROM media_assets WHERE url = $1', [c.image_url]); }
    await audit(user, 'category.delete', { entityType: 'category', entityId: id, details: { name: c?.name } });
    revalidatePath('/', 'layout');
    return { ok: 'Collection deleted. Its products are now uncategorised.' };
  });
}

export async function removeCategoryImageAction(formData) {
  const id = Number(formData.get('id'));
  await adminAction('categories.manage', '/admin/categories', async () => {
    const c = await one('SELECT image_url FROM categories WHERE id = $1', [id]);
    await query('UPDATE categories SET image_url = NULL WHERE id = $1', [id]);
    if (c?.image_url) { await deleteFile(c.image_url); await query('DELETE FROM media_assets WHERE url = $1', [c.image_url]); }
    revalidatePath('/', 'layout');
    return { ok: 'Image removed.' };
  });
}

/** Set an absolute stock level and record the difference as a movement. */
export async function adjustStockAction(formData) {
  const back = String(formData.get('back') || '/admin/inventory');
  await adminAction('inventory.manage', back.startsWith('/admin') ? back : '/admin/inventory', async (user) => {
    const productId = Number(formData.get('product_id'));
    const variantId = Number(formData.get('variant_id')) || null;
    const next = int(formData, 'stock', -1);
    if (next < 0) throw new UserError('Stock must be zero or more.');
    const reason = ['adjustment', 'restock', 'return'].includes(formData.get('reason')) ? formData.get('reason') : 'adjustment';
    await transaction(async (tx) => {
      const row = variantId
        ? await tx.one('SELECT stock FROM product_variants WHERE id = $1 AND product_id = $2 FOR UPDATE', [variantId, productId])
        : await tx.one('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [productId]);
      if (!row) throw new UserError('Item not found.');
      const diff = next - Number(row.stock);
      if (!diff) return;
      if (variantId) await tx.query('UPDATE product_variants SET stock = $2 WHERE id = $1', [variantId, next]);
      else await tx.query('UPDATE products SET stock = $2 WHERE id = $1', [productId, next]);
      await tx.query(
        `INSERT INTO inventory_movements (product_id, variant_id, change, reason, actor_id, note) VALUES ($1, $2, $3, $4, $5, $6)`,
        [productId, variantId, diff, reason, user.id, cleanString(formData.get('note'), 200) || null]
      );
    });
    await audit(user, 'inventory.adjust', { entityType: 'product', entityId: productId, details: { variantId, stock: next, reason } });
    revalidatePath('/', 'layout');
    return { ok: 'Stock updated.' };
  });
}
