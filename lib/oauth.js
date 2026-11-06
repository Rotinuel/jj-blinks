// Google and Facebook sign-in (OAuth 2.0 authorisation-code flow), implemented with fetch and
// node:crypto — no auth library. Secrets stay on the server.
//   Google:   https://developers.google.com/identity/openid-connect/reference
//   Facebook: https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
import { createHash, createHmac } from 'node:crypto';
import { appUrl, randomToken } from './utilities.js';

export const FACEBOOK_GRAPH_VERSION = 'v26.0';

export const PROVIDERS = {
  google: {
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    idEnv: 'GOOGLE_CLIENT_ID',
    secretEnv: 'GOOGLE_CLIENT_SECRET',
    pkce: true,
  },
  facebook: {
    label: 'Facebook',
    authorizeUrl: `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`,
    userinfoUrl: `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me`,
    scope: 'email,public_profile',
    idEnv: 'FACEBOOK_APP_ID',
    secretEnv: 'FACEBOOK_APP_SECRET',
    pkce: false,
  },
};

export function isProvider(name) {
  return Object.hasOwn(PROVIDERS, name);
}

export function providerConfigured(name, env = process.env) {
  const p = PROVIDERS[name];
  return Boolean(p && env[p.idEnv] && env[p.secretEnv]);
}

export function configuredProviders(env = process.env) {
  return Object.keys(PROVIDERS)
    .filter((n) => providerConfigured(n, env))
    .map((n) => ({ id: n, label: PROVIDERS[n].label }));
}

export function redirectUri(name) {
  return appUrl(`/api/auth/${name}/callback`);
}

/** PKCE (RFC 7636, S256). */
export function pkcePair() {
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizeUrl(name, { state, codeChallenge, env = process.env }) {
  const p = PROVIDERS[name];
  const u = new URL(p.authorizeUrl);
  u.searchParams.set('client_id', env[p.idEnv]);
  u.searchParams.set('redirect_uri', redirectUri(name));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', p.scope);
  u.searchParams.set('state', state);
  if (p.pkce && codeChallenge) {
    u.searchParams.set('code_challenge', codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
  }
  if (name === 'google') u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

async function readJson(res, what) {
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`${what} failed (${res.status})`);
  return data;
}

export async function exchangeCode(name, code, verifier, env = process.env) {
  const p = PROVIDERS[name];
  if (name === 'google') {
    const body = new URLSearchParams({
      code, client_id: env[p.idEnv], client_secret: env[p.secretEnv], redirect_uri: redirectUri(name),
      grant_type: 'authorization_code', code_verifier: verifier,
    });
    const res = await fetch(p.tokenUrl, {
      method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000), cache: 'no-store',
    });
    return (await readJson(res, 'Google token exchange')).access_token;
  }
  const u = new URL(p.tokenUrl);
  u.searchParams.set('client_id', env[p.idEnv]);
  u.searchParams.set('client_secret', env[p.secretEnv]);
  u.searchParams.set('redirect_uri', redirectUri(name));
  u.searchParams.set('code', code);
  const res = await fetch(u, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
  return (await readJson(res, 'Facebook token exchange')).access_token;
}

/** Normalised profile: { providerUserId, email, emailVerified, name }. */
export function normaliseProfile(name, raw) {
  if (name === 'google') {
    return {
      providerUserId: raw?.sub ? String(raw.sub) : null,
      email: raw?.email || null,
      emailVerified: raw?.email_verified === true || raw?.email_verified === 'true',
      name: raw?.name || raw?.given_name || null,
    };
  }
  return {
    providerUserId: raw?.id ? String(raw.id) : null,
    email: raw?.email || null,
    // Facebook's email is not treated as proof of ownership for linking to existing accounts.
    emailVerified: false,
    name: raw?.name || null,
  };
}

export async function fetchProfile(name, accessToken, env = process.env) {
  const p = PROVIDERS[name];
  if (!accessToken) throw new Error('No access token');
  if (name === 'google') {
    const res = await fetch(p.userinfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000), cache: 'no-store',
    });
    return normaliseProfile(name, await readJson(res, 'Google profile'));
  }
  const u = new URL(p.userinfoUrl);
  u.searchParams.set('fields', 'id,name,email');
  u.searchParams.set('access_token', accessToken);
  u.searchParams.set('appsecret_proof', createHmac('sha256', env[p.secretEnv]).update(accessToken).digest('hex'));
  const res = await fetch(u, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
  return normaliseProfile(name, await readJson(res, 'Facebook profile'));
}
