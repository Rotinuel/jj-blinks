// Shared wrapper for admin server actions: permission check, error → flash message, redirect.
import { redirect } from 'next/navigation';
import { assertPermission } from './auth.js';
import { isUniqueViolation, isCheckViolation } from './db.js';

export function flashUrl(path, { ok, error } = {}) {
  const [base, qs = ''] = path.split('?');
  const p = new URLSearchParams(qs);
  p.delete('ok');
  p.delete('error');
  if (ok) p.set('ok', ok);
  if (error) p.set('error', error);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

function isRedirect(e) {
  return typeof e?.digest === 'string' && e.digest.startsWith('NEXT_REDIRECT');
}

/**
 * adminAction('products.edit', '/admin/products', async (user) => ({ ok: 'Saved.', path? }))
 */
export async function adminAction(permission, path, fn) {
  let result;
  try {
    const user = await assertPermission(permission);
    result = await fn(user);
  } catch (e) {
    if (isRedirect(e)) throw e;
    let msg = e?.userMessage;
    if (!msg && isUniqueViolation(e)) msg = 'That value is already in use. Choose another.';
    if (!msg && isCheckViolation(e)) msg = 'One of the values is not allowed. Check amounts and dates.';
    if (!msg) console.error('admin action failed', e);
    redirect(flashUrl(path, { error: msg || 'Something went wrong. Nothing was changed.' }));
  }
  redirect(flashUrl(result?.path || path, { ok: result?.ok || 'Saved.' }));
}

export class UserError extends Error {
  constructor(message) {
    super(message);
    this.userMessage = message;
  }
}
