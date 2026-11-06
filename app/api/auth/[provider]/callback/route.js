// Google/Facebook redirect back here. Checks the state cookie, exchanges the code on the
// server, reads the profile, then signs in (or links to the signed-in account).
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCode, fetchProfile, isProvider, providerConfigured } from '@/lib/oauth';
import { getCurrentUser, safeNext, signIn } from '@/lib/auth';
import { linkIdentity, resolveSocialLogin } from '@/lib/session';
import { safeEqual } from '@/lib/utilities';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const go = (path, qs = {}) => {
    const dest = new URL(path, url.origin);
    for (const [k, v] of Object.entries(qs)) if (v) dest.searchParams.set(k, v);
    return NextResponse.redirect(dest, 303);
  };

  const jar = await cookies();
  const raw = jar.get('jjb_oauth')?.value;
  jar.set('jjb_oauth', '', { path: '/api/auth', maxAge: 0 });
  let saved = null;
  try { saved = raw ? JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) : null; } catch { saved = null; }
  const back = saved?.m === 'link' ? '/account/details' : '/login';

  if (!isProvider(provider) || !providerConfigured(provider)) return go('/login', { error: 'unavailable' });
  if (url.searchParams.get('error')) return go(back, { error: 'cancelled', provider });
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!saved || saved.p !== provider || !code || !state || !safeEqual(saved.s, state)) {
    return go(back, { error: 'expired', provider });
  }

  let profile;
  try {
    const token = await exchangeCode(provider, code, saved.v);
    profile = await fetchProfile(provider, token);
  } catch (err) {
    console.error(`${provider} sign-in failed:`, err?.message);
    return go(back, { error: 'failed', provider });
  }

  if (saved.m === 'link') {
    const user = await getCurrentUser();
    if (!user) return go('/login', { error: 'expired', provider });
    const r = await linkIdentity(user.id, provider, profile);
    if (r === 'taken') return go('/account/details', { error: 'taken', provider });
    await audit(user, 'account.identity_linked', { entityType: 'user', entityId: user.id, details: { provider } });
    return go('/account/details', { ok: 'linked', provider });
  }

  const r = await resolveSocialLogin(provider, profile);
  if (r.error) return go('/login', { error: r.error, provider, next: saved.n });
  await signIn(r.user);
  return go(safeNext(saved.n, '/account'));
}
