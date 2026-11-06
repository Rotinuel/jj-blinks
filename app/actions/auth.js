'use server';

import { redirect } from 'next/navigation';
import { clientIp, safeNext, signIn, signOut } from '@/lib/auth';
import { authenticate, createPasswordResetToken, findUserByIdentifier, registerCustomer, resetPasswordWithToken } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { normalizePhone, parseIdentifier, validate, validatePassword } from '@/lib/validation';
import { isStaff } from '@/lib/permissions';
import { emailConfigured, sendEmail, templates } from '@/lib/email';
import { appUrl } from '@/lib/utilities';
import { audit } from '@/lib/audit';

const GENERIC = 'Those sign-in details do not match an account.';

export async function loginAction(_prev, formData) {
  const identifier = String(formData.get('identifier') || '').trim().slice(0, 254);
  const password = String(formData.get('password') || '');
  const ip = await clientIp();
  const id = parseIdentifier(identifier);
  const key = id ? id.email || id.phone : null;
  if (!(await rateLimit('login', `${ip}`)).ok || (key && !(await rateLimit('login', `id:${key}`)).ok)) {
    return { message: 'Too many sign-in attempts. Wait 15 minutes and try again.', identifier };
  }
  if (!id) return { message: 'Enter your email address or a phone number with country code.', identifier };
  if (!password) return { message: GENERIC, identifier };
  const user = await authenticate(identifier, password);
  if (!user) return { message: GENERIC, identifier };
  await signIn(user);
  redirect(safeNext(formData.get('next'), '/account'));
}

export async function adminLoginAction(_prev, formData) {
  const identifier = String(formData.get('identifier') || '').trim().slice(0, 254);
  const password = String(formData.get('password') || '');
  const ip = await clientIp();
  const id = parseIdentifier(identifier);
  const key = id ? id.email || id.phone : null;
  if (!(await rateLimit('login', `admin:${ip}`)).ok || (key && !(await rateLimit('login', `admin-id:${key}`)).ok)) {
    return { message: 'Too many sign-in attempts. Wait 15 minutes and try again.', identifier };
  }
  const user = id && password ? await authenticate(identifier, password) : null;
  if (!user || !isStaff(user.role)) {
    await audit(null, 'staff.login_failed', { details: { identifier: key }, ip });
    return { message: GENERIC, identifier };
  }
  await signIn(user);
  await audit(user, 'staff.login', { ip });
  redirect(safeNext(formData.get('next'), '/admin'));
}

export async function registerAction(_prev, formData) {
  if (!(await rateLimit('register', await clientIp())).ok) return { message: 'Too many attempts. Try again later.' };
  const { data, errors, ok } = validate(formData, {
    name: { required: true, max: 120, label: 'name' },
    email: { type: 'email', required: true },
    phone: { max: 32 },
  });
  const password = String(formData.get('password') || '');
  const pwProblem = validatePassword(password);
  if (pwProblem) errors.password = pwProblem;
  const phone = data.phone ? normalizePhone(data.phone, 'NG') : null;
  if (data.phone && !phone) errors.phone = 'Enter a phone number with country code.';
  const values = { name: formData.get('name'), email: formData.get('email'), phone: formData.get('phone') };
  if (!ok || pwProblem || errors.phone) return { errors, message: 'Check the highlighted fields.', values };
  const r = await registerCustomer({ name: data.name, email: data.email, phone, password });
  if (r.error === 'email') return { errors: { email: 'An account with this email already exists. Sign in or reset your password.' }, values };
  if (r.error === 'phone') return { errors: { phone: 'This phone number is already linked to another account.' }, values };
  await signIn(r.user);
  redirect(safeNext(formData.get('next'), '/account'));
}

export async function logoutAction() {
  await signOut();
  redirect('/');
}

export async function forgotPasswordAction(_prev, formData) {
  const id = parseIdentifier(formData.get('identifier'));
  if (!id) return { ok: false, message: 'Enter your email address or a phone number with country code.' };
  const key = id.email || id.phone;
  if (!(await rateLimit('passwordReset', await clientIp())).ok || !(await rateLimit('passwordReset', `id:${key}`)).ok) {
    return { ok: false, message: 'Too many requests. Try again later.' };
  }
  if (!emailConfigured()) {
    return { ok: false, message: 'Password reset by email is not available yet. Contact us and we will help you regain access.' };
  }
  const user = await findUserByIdentifier(key);
  if (user?.is_active) {
    const token = await createPasswordResetToken(user.id);
    const t = templates.passwordReset(user.name, appUrl(`/reset-password?token=${encodeURIComponent(token)}`));
    await sendEmail({ to: user.email, ...t });
  }
  // Same answer whether or not the account exists.
  return { ok: true, message: 'If an account matches, a reset link is on its way to the email address on that account. It expires in 60 minutes.' };
}

export async function resetPasswordAction(_prev, formData) {
  const token = String(formData.get('token') || '');
  const password = String(formData.get('password') || '');
  const problem = validatePassword(password);
  if (problem) return { ok: false, message: problem };
  if (password !== String(formData.get('confirm') || '')) return { ok: false, message: 'Passwords do not match.' };
  if (!(await rateLimit('passwordReset', `reset:${await clientIp()}`)).ok) return { ok: false, message: 'Too many attempts. Try again later.' };
  const ok = await resetPasswordWithToken(token, password);
  if (!ok) return { ok: false, message: 'This reset link is invalid or has expired. Request a new one.' };
  redirect('/login?reset=1');
}
