// Request-bound auth helpers for Server Components, Server Actions and Route Handlers.
// Every protected operation calls requireUser / requireStaff / requirePermission on the server.
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createSession, destroySession, getSessionUser } from './session.js';
import { can, isStaff } from './permissions.js';

export const SESSION_COOKIE = 'jjb_session';

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.userMessage = message;
  }
}

export async function clientIp() {
  const h = await headers();
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await getSessionUser(token);
  } catch (err) {
    console.error('session lookup failed', err?.message);
    return null;
  }
});

export async function signIn(user) {
  const h = await headers();
  const { token, expiresAt } = await createSession(user, { ip: await clientIp(), userAgent: h.get('user-agent') });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  jar.delete(SESSION_COOKIE);
}

function safeNext(next, fallback) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

/** Pages: redirect to login when signed out. */
export async function requireUser(next = '/account') {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNext(next, '/account'))}`);
  return user;
}

/** Admin pages: staff only. */
export async function requireStaff(next = '/admin') {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) redirect(`/admin/login?next=${encodeURIComponent(safeNext(next, '/admin'))}`);
  return user;
}

/** Admin pages: staff with a specific permission; others are sent to the dashboard. */
export async function requirePermission(permission, next) {
  const user = await requireStaff(next);
  if (!can(user.role, permission)) redirect(`/admin?denied=${encodeURIComponent(permission)}`);
  return user;
}

/** Server actions / route handlers: throw instead of redirecting. */
export async function assertPermission(permission) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role) || !can(user.role, permission)) throw new ForbiddenError();
  return user;
}

export { safeNext };
