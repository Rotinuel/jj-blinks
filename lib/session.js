// Database side of authentication. Raw session and reset tokens are only ever held by the
// browser (HTTP-only cookie) or the user's inbox; the database stores SHA-256 hashes.
import { isUniqueViolation, one, query, transaction } from './db.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js';
import { randomToken, sha256 } from './utilities.js';
import { normalizeEmail, parseIdentifier } from './validation.js';
import { isStaff } from './permissions.js';

export const CUSTOMER_SESSION_HOURS = 24 * 30;
export const STAFF_SESSION_HOURS = 12;

export async function createSession(user, { ip = null, userAgent = null } = {}) {
  const token = randomToken(32);
  const hours = isStaff(user.role) ? STAFF_SESSION_HOURS : CUSTOMER_SESSION_HOURS;
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
  await query(
    'INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5)',
    [sha256(token), user.id, expiresAt.toISOString(), ip, userAgent ? String(userAgent).slice(0, 300) : null]
  );
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  return { token, expiresAt };
}

export async function getSessionUser(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const row = await one(
    `SELECT u.id, u.email, u.name, u.phone, u.role, u.is_active, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [sha256(token)]
  );
  if (!row || !row.is_active) return null;
  return row;
}

export async function destroySession(token) {
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
}

export async function destroyUserSessions(userId) {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function purgeExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at < NOW()');
  await query(`DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '1 day'`);
}

/** Find an account by email or phone (see parseIdentifier). */
export async function findUserByIdentifier(identifier) {
  const id = parseIdentifier(identifier);
  if (!id) return null;
  return id.email
    ? one('SELECT id, email, name, role, is_active, password_hash FROM users WHERE LOWER(email) = LOWER($1)', [id.email])
    : one('SELECT id, email, name, role, is_active, password_hash FROM users WHERE phone = $1', [id.phone]);
}

/**
 * Sign in with an email address or phone number and password. Returns the user or null.
 * Takes the same time whether or not the account exists.
 */
export async function authenticate(identifier, password) {
  const user = await findUserByIdentifier(identifier);
  const ok = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok || !user.is_active) return null;
  delete user.password_hash;
  return user;
}

/** Returns { user } or { error: 'email' | 'phone' } when that email/phone is already registered. */
export async function registerCustomer({ name, email, phone, password }) {
  const hash = await hashPassword(password);
  try {
    const user = await one(
      `INSERT INTO users (email, password_hash, name, phone, role) VALUES ($1, $2, $3, $4, 'customer')
       RETURNING id, email, name, role`,
      [email, hash, name, phone || null]
    );
    return { user };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: /phone/.test(err.message) ? 'phone' : 'email' };
    throw err;
  }
}

export async function createPasswordResetToken(userId) {
  const token = randomToken(32);
  await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [userId]);
  await query(
    `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '60 minutes')`,
    [sha256(token), userId]
  );
  return token;
}

/** Set a new password using a reset token. Invalidates the token and every session. */
export async function resetPasswordWithToken(token, newPassword) {
  if (!token || token.length > 100) return false;
  const hash = await hashPassword(newPassword);
  return transaction(async (tx) => {
    const row = await tx.one(
      `UPDATE password_reset_tokens SET used_at = NOW()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() RETURNING user_id`,
      [sha256(token)]
    );
    if (!row) return false;
    await tx.query('UPDATE users SET password_hash = $2 WHERE id = $1', [row.user_id, hash]);
    await tx.query('DELETE FROM sessions WHERE user_id = $1', [row.user_id]);
    return true;
  });
}

/**
 * Change the password (current password required), or set a first password for an account
 * created through Google/Facebook. Returns 'changed' | 'set' | false.
 * Changing signs out every session; setting a first password keeps the current one.
 */
export async function changePassword(userId, currentPassword, newPassword) {
  const u = await one('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!u) return false;
  if (!u.password_hash) {
    await query('UPDATE users SET password_hash = $2 WHERE id = $1 AND password_hash IS NULL', [userId, await hashPassword(newPassword)]);
    return 'set';
  }
  if (!(await verifyPassword(currentPassword, u.password_hash))) return false;
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, await hashPassword(newPassword)]);
  await destroyUserSessions(userId);
  return 'changed';
}

// ---------------------------------------------------------------------------
// Social sign-in (Google, Facebook)
// ---------------------------------------------------------------------------

/**
 * Decide which account a provider profile signs in to. Returns { user, created } or { error }.
 * Rules:
 *  - An identity already linked signs in to its account.
 *  - Otherwise, an existing customer account with the same email is linked automatically only
 *    when the provider says the email is verified (Google). Facebook never auto-links.
 *  - Staff accounts are never linked automatically.
 *  - Otherwise a new customer account is created (no password until the customer sets one).
 */
export async function resolveSocialLogin(provider, profile) {
  if (!profile?.providerUserId) return { error: 'failed' };
  const linked = await one(
    `SELECT u.id, u.email, u.name, u.role, u.is_active FROM user_identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = $1 AND i.provider_user_id = $2`,
    [provider, profile.providerUserId]
  );
  if (linked) {
    if (!linked.is_active) return { error: 'deactivated' };
    await query('UPDATE user_identities SET last_used_at = NOW(), email = COALESCE($3, email) WHERE provider = $1 AND provider_user_id = $2', [
      provider, profile.providerUserId, normalizeEmail(profile.email),
    ]);
    return { user: linked, created: false };
  }

  const email = normalizeEmail(profile.email);
  if (!email) return { error: 'no_email' };
  if (provider === 'google' && !profile.emailVerified) return { error: 'unverified' };

  return transaction(async (tx) => {
    const existing = await tx.one('SELECT id, email, name, role, is_active FROM users WHERE LOWER(email) = LOWER($1) FOR UPDATE', [email]);
    if (existing) {
      if (!existing.is_active) return { error: 'deactivated' };
      if (isStaff(existing.role)) return { error: 'staff', email };
      if (!(provider === 'google' && profile.emailVerified)) return { error: 'exists', email };
      await tx.query('INSERT INTO user_identities (provider, provider_user_id, user_id, email, last_used_at) VALUES ($1, $2, $3, $4, NOW())', [
        provider, profile.providerUserId, existing.id, email,
      ]);
      return { user: existing, created: false };
    }
    const name = String(profile.name || email.split('@')[0]).trim().slice(0, 120) || 'Customer';
    const user = await tx.one(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, NULL, $2, 'customer') RETURNING id, email, name, role`,
      [email, name]
    );
    await tx.query('INSERT INTO user_identities (provider, provider_user_id, user_id, email, last_used_at) VALUES ($1, $2, $3, $4, NOW())', [
      provider, profile.providerUserId, user.id, email,
    ]);
    return { user, created: true };
  });
}

/** Connect a provider to a signed-in account. Returns 'linked' | 'already' | 'taken'. */
export async function linkIdentity(userId, provider, profile) {
  if (!profile?.providerUserId) return 'taken';
  const owner = await one('SELECT user_id FROM user_identities WHERE provider = $1 AND provider_user_id = $2', [provider, profile.providerUserId]);
  if (owner) return Number(owner.user_id) === Number(userId) ? 'already' : 'taken';
  try {
    await query('INSERT INTO user_identities (provider, provider_user_id, user_id, email) VALUES ($1, $2, $3, $4)', [
      provider, profile.providerUserId, userId, normalizeEmail(profile.email),
    ]);
    return 'linked';
  } catch (err) {
    if (isUniqueViolation(err)) return 'taken'; // already has a different account from this provider
    throw err;
  }
}

/** Disconnect a provider, but never leave an account with no way to sign in. */
export async function unlinkIdentity(userId, provider) {
  return transaction(async (tx) => {
    const u = await tx.one('SELECT password_hash IS NOT NULL AS has_password FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const others = await tx.one('SELECT COUNT(*)::int AS n FROM user_identities WHERE user_id = $1 AND provider <> $2', [userId, provider]);
    if (!u?.has_password && Number(others.n) === 0) return 'last_method';
    const r = await tx.query('DELETE FROM user_identities WHERE user_id = $1 AND provider = $2 RETURNING provider', [userId, provider]);
    return r.length ? 'unlinked' : 'not_linked';
  });
}

export async function signInMethods(userId) {
  const [u, ids] = await Promise.all([
    one('SELECT password_hash IS NOT NULL AS has_password, phone FROM users WHERE id = $1', [userId]),
    query('SELECT provider, email, created_at, last_used_at FROM user_identities WHERE user_id = $1', [userId]),
  ]);
  return { hasPassword: Boolean(u?.has_password), phone: u?.phone || null, identities: ids };
}
