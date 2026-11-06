// Begin Google/Facebook sign-in. A short-lived HTTP-only cookie holds the CSRF state, the PKCE
// verifier and where to return; the callback checks it before trusting anything.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authorizeUrl, isProvider, pkcePair, providerConfigured } from '@/lib/oauth';
import { randomToken } from '@/lib/utilities';
import { safeNext } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { provider } = await params;
  const url = new URL(request.url);
  if (!isProvider(provider) || !providerConfigured(provider)) {
    return NextResponse.redirect(new URL('/login?error=unavailable', url.origin), 303);
  }
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (!(await rateLimit('login', `oauth:${ip}`)).ok) {
    return NextResponse.redirect(new URL('/login?error=ratelimited', url.origin), 303);
  }
  const mode = url.searchParams.get('mode') === 'link' ? 'link' : 'login';
  const next = safeNext(url.searchParams.get('next'), mode === 'link' ? '/account/details' : '/account');
  const state = randomToken(24);
  const { verifier, challenge } = pkcePair();
  (await cookies()).set('jjb_oauth', Buffer.from(JSON.stringify({ p: provider, s: state, v: verifier, n: next, m: mode })).toString('base64url'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(provider, { state, codeChallenge: challenge }), 303);
}
