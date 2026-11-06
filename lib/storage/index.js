// Image/file storage. Production: Vercel Blob (binary in Blob, URL + metadata in Postgres).
// Development without BLOB_READ_WRITE_TOKEN: files are written under public/uploads/dev/.
// The local fallback is refused when NODE_ENV=production.
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomToken } from '../utilities.js';

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request body limit

const TYPES = {
  'image/jpeg': { ext: 'jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', check: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  'application/pdf': { ext: 'pdf', check: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
};

export const PURPOSES = {
  product: { folder: 'products', types: ['image/jpeg', 'image/png', 'image/webp'] },
  category: { folder: 'categories', types: ['image/jpeg', 'image/png', 'image/webp'] },
  content: { folder: 'content', types: ['image/jpeg', 'image/png', 'image/webp'] },
  custom_reference: { folder: 'requests/references', types: ['image/jpeg', 'image/png', 'image/webp'] },
  logo: { folder: 'requests/logos', types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
};

/** Detect the real type from magic bytes (the browser-declared type is not trusted). */
export function sniffType(buffer) {
  for (const [type, t] of Object.entries(TYPES)) if (buffer.length >= 12 && t.check(buffer)) return type;
  return null;
}

export function validateUpload(buffer, purpose) {
  const cfg = PURPOSES[purpose];
  if (!cfg) return { ok: false, error: 'Unknown upload purpose.' };
  if (!buffer?.length) return { ok: false, error: 'The file is empty.' };
  if (buffer.length > MAX_UPLOAD_BYTES) return { ok: false, error: 'Files must be 4 MB or smaller.' };
  const type = sniffType(buffer);
  if (!type || !cfg.types.includes(type)) {
    const allowed = cfg.types.map((t) => TYPES[t].ext.toUpperCase()).join(', ');
    return { ok: false, error: `Unsupported file type. Use ${allowed}.` };
  }
  return { ok: true, type, ext: TYPES[type].ext };
}

export function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function storageAvailable() {
  return blobConfigured() || process.env.NODE_ENV !== 'production';
}

/** Store a validated buffer. Returns { url, pathname, contentType, size }. */
export async function storeFile(buffer, purpose) {
  const v = validateUpload(buffer, purpose);
  if (!v.ok) throw Object.assign(new Error(v.error), { userMessage: v.error });
  const pathname = `${PURPOSES[purpose].folder}/${Date.now().toString(36)}-${randomToken(12)}.${v.ext}`;

  if (blobConfigured()) {
    const { put } = await import('@vercel/blob');
    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType: v.type,
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return { url: blob.url, pathname: blob.pathname, contentType: v.type, size: buffer.length };
  }

  if (process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('BLOB_READ_WRITE_TOKEN is not configured'), {
      userMessage: 'File uploads are not configured yet.',
    });
  }
  const abs = path.join(process.cwd(), 'public', 'uploads', 'dev', pathname);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return { url: `/uploads/dev/${pathname}`, pathname, contentType: v.type, size: buffer.length };
}

/** Delete a stored object by URL. Unknown URLs (e.g. bundled placeholders) are ignored. */
export async function deleteFile(url) {
  if (!url) return;
  try {
    if (/\.blob\.vercel-storage\.com\//.test(url)) {
      if (!blobConfigured()) return;
      const { del } = await import('@vercel/blob');
      await del(url);
    } else if (url.startsWith('/uploads/dev/') && process.env.NODE_ENV !== 'production') {
      const rel = url.replace(/^\/uploads\/dev\//, '');
      if (rel.includes('..')) return;
      await unlink(path.join(process.cwd(), 'public', 'uploads', 'dev', rel));
    }
  } catch (err) {
    console.warn('deleteFile failed', url, err?.message);
  }
}
