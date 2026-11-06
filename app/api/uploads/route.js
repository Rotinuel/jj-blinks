// Protected upload endpoint. One file per request (keeps under Vercel's body limit).
//  - Public purposes (custom_reference, logo): rate-limited, bound to an anonymous HTTP-only
//    owner cookie so files can only be attached by the visitor who uploaded them.
//  - Admin purposes (product, category, content): require the media.upload permission and
//    attach the file to its target immediately, replacing (and deleting) any previous image.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { can, isStaff } from '@/lib/permissions';
import { deleteFile, PURPOSES, storeFile, MAX_UPLOAD_BYTES, storageAvailable } from '@/lib/storage';
import { one, query } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { randomToken, sha256 } from '@/lib/utilities';
import { getSettings, saveSettingsSection } from '@/lib/settings';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
const OWNER_COOKIE = 'jjb_upl';
const CONTENT_SLOTS = ['hero', 'custom_feature', 'apparel', 'story'];

function fail(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get('host'); } catch { return false; }
}

export async function POST(request) {
  if (!sameOrigin(request)) return fail('Cross-site upload refused.', 403);
  if (!storageAvailable()) return fail('File uploads are not configured yet.', 503);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return fail('Files must be 4 MB or smaller.', 413);

  let form;
  try { form = await request.formData(); } catch { return fail('Invalid upload.'); }
  const purpose = String(form.get('purpose') || '');
  const file = form.get('file');
  if (!PURPOSES[purpose]) return fail('Unknown upload purpose.');
  if (!file || typeof file.arrayBuffer !== 'function') return fail('Choose a file to upload.');
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

  const isPublic = purpose === 'custom_reference' || purpose === 'logo';
  const user = await getCurrentUser();
  if (!isPublic && !(user && isStaff(user.role) && can(user.role, 'media.upload') && (purpose !== 'content' || can(user.role, 'content.manage')))) {
    return fail('You do not have permission to upload this file.', 403);
  }
  if (!(await rateLimit('upload', isPublic ? ip : `staff:${user.id}`)).ok) return fail('Too many uploads. Try again later.', 429);

  let stored;
  try {
    stored = await storeFile(Buffer.from(await file.arrayBuffer()), purpose);
  } catch (err) {
    return fail(err.userMessage || 'Upload failed.', err.userMessage ? 400 : 500);
  }

  let ownerKey = null;
  const jar = await cookies();
  if (isPublic) {
    ownerKey = jar.get(OWNER_COOKIE)?.value;
    if (!ownerKey || ownerKey.length > 64) {
      ownerKey = randomToken(24);
      jar.set(OWNER_COOKIE, ownerKey, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 });
    }
  }
  const media = await one(
    `INSERT INTO media_assets (url, pathname, content_type, size_bytes, purpose, owner_key_hash, uploaded_by, attached)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, url`,
    [stored.url, stored.pathname, stored.contentType, stored.size, purpose, ownerKey ? sha256(ownerKey) : null, user?.id ?? null, !isPublic]
  );

  const alt = String(form.get('alt') || '').slice(0, 200);
  if (purpose === 'product') {
    const productId = Number(form.get('productId'));
    const product = Number.isSafeInteger(productId) ? await one('SELECT id, slug FROM products WHERE id = $1', [productId]) : null;
    if (!product) { await removeMedia(stored.url); return fail('Product not found.', 404); }
    const replaceId = Number(form.get('replaceImageId'));
    if (Number.isSafeInteger(replaceId) && replaceId > 0) {
      const prev = await one('SELECT url FROM product_images WHERE id = $1 AND product_id = $2', [replaceId, productId]);
      if (!prev) { await removeMedia(stored.url); return fail('Image not found.', 404); }
      await query('UPDATE product_images SET url = $3, media_id = $4 WHERE id = $1 AND product_id = $2', [replaceId, productId, stored.url, media.id]);
      await removeMedia(prev.url);
    } else {
      await query(
        `INSERT INTO product_images (product_id, media_id, url, alt, sort_order)
         VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(sort_order) + 1 FROM product_images WHERE product_id = $1), 0))`,
        [productId, media.id, stored.url, alt || null]
      );
    }
    await audit(user, 'product.image_upload', { entityType: 'product', entityId: productId, details: { url: stored.url } });
    revalidatePath(`/products/${product.slug}`);
  } else if (purpose === 'category') {
    const categoryId = Number(form.get('categoryId'));
    const prev = await one('SELECT image_url FROM categories WHERE id = $1', [categoryId]);
    if (!prev) { await removeMedia(stored.url); return fail('Collection not found.', 404); }
    await query('UPDATE categories SET image_url = $2, image_alt = COALESCE(NULLIF($3, \'\'), image_alt) WHERE id = $1', [categoryId, stored.url, alt]);
    if (prev.image_url) await removeMedia(prev.image_url);
    await audit(user, 'category.image_upload', { entityType: 'category', entityId: categoryId });
  } else if (purpose === 'content') {
    const slot = String(form.get('slot') || '');
    if (!CONTENT_SLOTS.includes(slot)) { await removeMedia(stored.url); return fail('Unknown content slot.'); }
    const settings = await getSettings();
    const prevUrl = settings.home[slot]?.image_url;
    const home = { ...settings.home, [slot]: { ...settings.home[slot], image_url: stored.url, image_alt: alt || settings.home[slot]?.image_alt || '' } };
    await saveSettingsSection('home', home, user.id);
    if (prevUrl) await removeMedia(prevUrl);
    await audit(user, 'content.image_upload', { entityType: 'content', entityId: slot });
  }
  if (!isPublic) revalidatePath('/', 'layout');
  return NextResponse.json({ id: Number(media.id), url: media.url });
}

async function removeMedia(url) {
  await deleteFile(url);
  await query('DELETE FROM media_assets WHERE url = $1', [url]);
}

