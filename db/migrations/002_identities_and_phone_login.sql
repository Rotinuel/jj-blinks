-- Social sign-in (Google, Facebook) and sign-in with phone number.

-- Accounts created through Google/Facebook may not have a password until the customer sets one.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Phone numbers are stored in E.164 (+2348032242010) and can be used to sign in,
-- so one number can belong to only one account.
CREATE UNIQUE INDEX users_phone_key ON users (phone) WHERE phone IS NOT NULL;

-- Linked external identities. The provider's stable user id (Google "sub", Facebook "id")
-- is the key; the email is kept only for display.
CREATE TABLE user_identities (
  provider          TEXT NOT NULL CHECK (provider IN ('google', 'facebook')),
  provider_user_id  TEXT NOT NULL,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at      TIMESTAMPTZ,
  PRIMARY KEY (provider, provider_user_id),
  UNIQUE (user_id, provider)
);
CREATE INDEX user_identities_user_idx ON user_identities (user_id);
