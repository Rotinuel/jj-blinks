'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { clientIp, getCurrentUser, requireUser, signOut } from '@/lib/auth';
import { isUniqueViolation, one, query, transaction } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { validate, validateAddress, validatePassword, normalizePhone } from '@/lib/validation';
import { changePassword, unlinkIdentity } from '@/lib/session';
import { isProvider } from '@/lib/oauth';
import { audit } from '@/lib/audit';

export async function toggleWishlistAction(formData) {
  const user = await getCurrentUser();
  const slug = String(formData.get('slug') || '');
  const backRaw = String(formData.get('back') || '');
  const back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : `/products/${slug}`;
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  const productId = Number(formData.get('productId'));
  if (!Number.isSafeInteger(productId)) return;
  const removed = await query('DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2 RETURNING product_id', [user.id, productId]);
  if (!removed.length) {
    await query(
      `INSERT INTO wishlists (user_id, product_id) SELECT $1, id FROM products WHERE id = $2 AND status = 'published' ON CONFLICT DO NOTHING`,
      [user.id, productId]
    );
  }
  revalidatePath(`/products/${slug}`);
  revalidatePath('/account/wishlist');
  revalidatePath(back.split('?')[0]);
}

export async function submitReviewAction(_prev, formData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'Sign in to review.' };
  if (!(await rateLimit('review', `u${user.id}`)).ok) return { ok: false, message: 'Too many reviews. Try again later.' };
  const { data, errors, ok } = validate(formData, {
    productId: { type: 'int', required: true, min: 1 },
    rating: { type: 'int', required: true, min: 1, max: 5 },
    title: { max: 120 },
    body: { required: true, min: 10, max: 2000, label: 'review' },
  });
  if (!ok) return { ok: false, errors, message: Object.values(errors)[0] };
  const bought = await one(
    `SELECT 1 AS x FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.user_id = $1 AND oi.product_id = $2 AND o.payment_status IN ('paid','partially_refunded') LIMIT 1`,
    [user.id, data.productId]
  );
  if (!bought) return { ok: false, message: 'Reviews are open to customers who bought this piece.' };
  try {
    await query(
      `INSERT INTO reviews (product_id, user_id, display_name, rating, title, body, verified_purchase) VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
      [data.productId, user.id, user.name.split(' ')[0] || 'Customer', data.rating, data.title, data.body]
    );
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: 'You have already reviewed this piece.' };
    throw err;
  }
  return { ok: true, message: 'Thank you. Your review will appear once it has been checked.' };
}

export async function updateDetailsAction(_prev, formData) {
  const user = await requireUser('/account/details');
  const { data, errors, ok } = validate(formData, { name: { required: true, max: 120 }, phone: { max: 32 } });
  if (!ok) return { ok: false, errors, message: 'Check the highlighted fields.' };
  const phone = data.phone ? normalizePhone(data.phone, 'NG') : null;
  if (data.phone && !phone) return { ok: false, errors: { phone: 'Enter a phone number with country code.' } };
  try {
    await query('UPDATE users SET name = $2, phone = $3 WHERE id = $1', [user.id, data.name, phone]);
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, errors: { phone: 'This phone number is already linked to another account.' } };
    throw err;
  }
  revalidatePath('/account');
  return { ok: true, message: 'Details saved.' };
}

export async function changePasswordAction(_prev, formData) {
  const user = await requireUser('/account/details');
  if (!(await rateLimit('login', `pw:${user.id}:${await clientIp()}`)).ok) return { ok: false, message: 'Too many attempts. Try again later.' };
  const next = String(formData.get('new_password') || '');
  const problem = validatePassword(next);
  if (problem) return { ok: false, errors: { new_password: problem } };
  if (next !== String(formData.get('confirm_password') || '')) return { ok: false, errors: { confirm_password: 'Passwords do not match.' } };
  const result = await changePassword(user.id, String(formData.get('current_password') || ''), next);
  if (!result) return { ok: false, errors: { current_password: 'Current password is incorrect.' } };
  if (result === 'set') {
    revalidatePath('/account/details');
    return { ok: true, message: 'Password set. You can now also sign in with your email or phone number and this password.' };
  }
  await signOut();
  redirect('/login?changed=1');
}

export async function unlinkIdentityAction(formData) {
  const user = await requireUser('/account/details');
  const provider = String(formData.get('provider') || '');
  if (!isProvider(provider)) return;
  const r = await unlinkIdentity(user.id, provider);
  if (r === 'last_method') redirect('/account/details?error=last_method');
  await audit(user, 'account.identity_unlinked', { entityType: 'user', entityId: user.id, details: { provider } });
  redirect(`/account/details?ok=unlinked&provider=${provider}`);
}

export async function saveAddressAction(_prev, formData) {
  const user = await requireUser('/account/addresses');
  const v = validateAddress(formData);
  if (!v.ok) return { ok: false, errors: v.errors, message: 'Check the highlighted fields.' };
  const label = String(formData.get('label') || '').slice(0, 40) || null;
  const makeDefault = formData.get('is_default') === 'on';
  const count = await one('SELECT COUNT(*)::int AS n FROM addresses WHERE user_id = $1', [user.id]);
  if (Number(count.n) >= 10) return { ok: false, message: 'You can save up to 10 addresses.' };
  await transaction(async (tx) => {
    if (makeDefault || Number(count.n) === 0) await tx.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [user.id]);
    const a = v.address;
    await tx.query(
      `INSERT INTO addresses (user_id, label, full_name, phone, country_code, region, city, postal_code, line1, line2, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [user.id, label, a.full_name, a.phone, a.country_code, a.region, a.city, a.postal_code, a.line1, a.line2, makeDefault || Number(count.n) === 0]
    );
  });
  revalidatePath('/account/addresses');
  return { ok: true, message: 'Address saved.' };
}

export async function deleteAddressAction(formData) {
  const user = await requireUser('/account/addresses');
  await query('DELETE FROM addresses WHERE id = $1 AND user_id = $2', [Number(formData.get('id')), user.id]);
  revalidatePath('/account/addresses');
}

export async function defaultAddressAction(formData) {
  const user = await requireUser('/account/addresses');
  const id = Number(formData.get('id'));
  await transaction(async (tx) => {
    const own = await tx.one('SELECT id FROM addresses WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!own) return;
    await tx.query('UPDATE addresses SET is_default = (id = $2) WHERE user_id = $1', [user.id, id]);
  });
  revalidatePath('/account/addresses');
}
