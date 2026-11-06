-- JJ BLINKS — initial schema
-- Money is stored as integer minor units (kobo for NGN, cents for USD) in BIGINT columns.
-- All timestamps are TIMESTAMPTZ and written in UTC (NOW() on a UTC server / Neon).

-- ---------------------------------------------------------------------------
-- Users, sessions, auth
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,
  phone           TEXT,
  role            TEXT NOT NULL DEFAULT 'customer'
                  CHECK (role IN ('super_admin','admin','inventory_manager','order_manager','customer')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (LOWER(email));
CREATE INDEX users_role_idx ON users (role);

CREATE TABLE sessions (
  token_hash      TEXT PRIMARY KEY,               -- SHA-256 of the cookie token; raw token never stored
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip              TEXT,
  user_agent      TEXT
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE password_reset_tokens (
  token_hash      TEXT PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX password_reset_user_idx ON password_reset_tokens (user_id);

CREATE TABLE addresses (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label           TEXT,
  full_name       TEXT NOT NULL,
  phone           TEXT NOT NULL,
  country_code    CHAR(2) NOT NULL,
  region          TEXT,
  city            TEXT NOT NULL,
  postal_code     TEXT,
  line1           TEXT NOT NULL,
  line2           TEXT,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX addresses_user_idx ON addresses (user_id);

-- ---------------------------------------------------------------------------
-- Media (Vercel Blob objects; binaries live in Blob, metadata here)
-- ---------------------------------------------------------------------------
CREATE TABLE media_assets (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url             TEXT NOT NULL UNIQUE,
  pathname        TEXT NOT NULL,
  content_type    TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL CHECK (size_bytes > 0),
  purpose         TEXT NOT NULL CHECK (purpose IN ('product','category','content','custom_reference','logo')),
  owner_key_hash  TEXT,                            -- for anonymous uploads (custom-order references)
  uploaded_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  attached        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX media_unattached_idx ON media_assets (created_at) WHERE attached = FALSE;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description     TEXT,
  image_url       TEXT,
  image_alt       TEXT,
  kind            TEXT NOT NULL DEFAULT 'shop' CHECK (kind IN ('shop','service')),  -- 'service' = custom/bulk enquiry categories
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  seo_title       TEXT,
  seo_description TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id           BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sku                   TEXT NOT NULL UNIQUE,
  short_description     TEXT,
  description           TEXT,
  price_kobo            BIGINT NOT NULL CHECK (price_kobo >= 0),
  compare_at_kobo       BIGINT CHECK (compare_at_kobo IS NULL OR compare_at_kobo > 0),
  cost_kobo             BIGINT CHECK (cost_kobo IS NULL OR cost_kobo >= 0),   -- internal; restricted
  stock                 INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),          -- used when product has no variants
  track_inventory       BOOLEAN NOT NULL DEFAULT TRUE,
  low_stock_threshold   INTEGER NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0),
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  is_featured           BOOLEAN NOT NULL DEFAULT FALSE,
  tags                  TEXT[] NOT NULL DEFAULT '{}',
  options               JSONB NOT NULL DEFAULT '[]',   -- [{ "name": "Colour", "values": ["Gold","Wine"] }]
  customization_options JSONB NOT NULL DEFAULT '[]',   -- [{ "key","label","type":"text|select","choices":[],"required":bool,"max_length":int }]
  materials             TEXT,
  care                  TEXT,
  weight_grams          INTEGER CHECK (weight_grams IS NULL OR weight_grams >= 0),
  is_sample             BOOLEAN NOT NULL DEFAULT FALSE, -- development sample data marker
  seo_title             TEXT,
  seo_description       TEXT,
  published_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (compare_at_kobo IS NULL OR compare_at_kobo > price_kobo)
);
CREATE INDEX products_category_idx ON products (category_id);
CREATE INDEX products_status_published_idx ON products (status, published_at DESC);
CREATE INDEX products_featured_idx ON products (is_featured) WHERE is_featured;
CREATE INDEX products_tags_idx ON products USING GIN (tags);
CREATE INDEX products_search_idx ON products USING GIN (
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(short_description,'') || ' ' || coalesce(sku,''))
);

CREATE TABLE product_variants (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id       BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku              TEXT NOT NULL UNIQUE,
  option_values    JSONB NOT NULL DEFAULT '{}',   -- { "Colour": "Gold", "Size": "M" }
  price_kobo       BIGINT CHECK (price_kobo IS NULL OR price_kobo >= 0),  -- NULL = product price
  compare_at_kobo  BIGINT CHECK (compare_at_kobo IS NULL OR compare_at_kobo > 0),
  stock            INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX product_variants_product_idx ON product_variants (product_id);

CREATE TABLE product_images (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id    BIGINT REFERENCES media_assets(id) ON DELETE SET NULL,
  url         TEXT NOT NULL,
  alt         TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX product_images_product_idx ON product_images (product_id, sort_order);

CREATE TABLE inventory_movements (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id   BIGINT REFERENCES products(id) ON DELETE SET NULL,
  variant_id   BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
  change       INTEGER NOT NULL,
  reason       TEXT NOT NULL CHECK (reason IN ('adjustment','order_reserved','order_released','restock','return')),
  order_id     BIGINT,
  actor_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX inventory_movements_product_idx ON inventory_movements (product_id, created_at DESC);

CREATE TABLE wishlists (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Shipping
-- ---------------------------------------------------------------------------
CREATE TABLE shipping_zones (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  is_fallback  BOOLEAN NOT NULL DEFAULT FALSE,   -- applies to any country not listed in another zone
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX shipping_zones_one_fallback ON shipping_zones (is_fallback) WHERE is_fallback;

CREATE TABLE shipping_zone_countries (
  zone_id       BIGINT NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
  country_code  CHAR(2) NOT NULL UNIQUE,            -- a country belongs to at most one zone
  PRIMARY KEY (zone_id, country_code)
);

CREATE TABLE shipping_blocked_countries (
  country_code  CHAR(2) PRIMARY KEY,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shipping_methods (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zone_id            BIGINT NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('flat','weight','order_value','pickup','quote')),
  flat_rate_kobo     BIGINT CHECK (flat_rate_kobo IS NULL OR flat_rate_kobo >= 0),
  rate_table         JSONB NOT NULL DEFAULT '[]',  -- weight: [{"max_grams":1000,"rate_kobo":..}], order_value: [{"min_subtotal_kobo":0,"rate_kobo":..}]
  free_over_kobo     BIGINT CHECK (free_over_kobo IS NULL OR free_over_kobo >= 0),
  est_days_min       INTEGER CHECK (est_days_min IS NULL OR est_days_min >= 0),
  est_days_max       INTEGER CHECK (est_days_max IS NULL OR est_days_max >= 0),
  carrier_name       TEXT,
  description        TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (type <> 'flat' OR flat_rate_kobo IS NOT NULL),
  CHECK (est_days_min IS NULL OR est_days_max IS NULL OR est_days_min <= est_days_max)
);
CREATE INDEX shipping_methods_zone_idx ON shipping_methods (zone_id, sort_order);

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
CREATE TABLE coupons (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                  TEXT NOT NULL UNIQUE CHECK (code = UPPER(code) AND code ~ '^[A-Z0-9_-]{3,32}$'),
  description           TEXT,
  type                  TEXT NOT NULL CHECK (type IN ('percent','fixed','free_shipping')),
  value                 BIGINT NOT NULL DEFAULT 0 CHECK (value >= 0),  -- percent: 1-100; fixed: kobo
  min_subtotal_kobo     BIGINT NOT NULL DEFAULT 0 CHECK (min_subtotal_kobo >= 0),
  max_discount_kobo     BIGINT CHECK (max_discount_kobo IS NULL OR max_discount_kobo > 0),
  starts_at             TIMESTAMPTZ,
  ends_at               TIMESTAMPTZ,
  usage_limit           INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_limit_per_email INTEGER CHECK (usage_limit_per_email IS NULL OR usage_limit_per_email > 0),
  used_count            INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (type <> 'percent' OR (value BETWEEN 1 AND 100)),
  CHECK (usage_limit IS NULL OR used_count <= usage_limit),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

-- ---------------------------------------------------------------------------
-- Orders and payments
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number         TEXT NOT NULL UNIQUE,
  kind                 TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard','custom')),
  user_id              BIGINT REFERENCES users(id) ON DELETE SET NULL,
  email                TEXT NOT NULL,
  phone                TEXT NOT NULL,
  customer_name        TEXT NOT NULL,
  status               TEXT NOT NULL CHECK (status IN (
                         'awaiting_quote','pending_payment','paid','processing','shipped',
                         'delivered','cancelled','expired','refunded','partially_refunded')),
  payment_status       TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN (
                         'unpaid','paid','failed','refunded','partially_refunded')),
  currency             CHAR(3) NOT NULL DEFAULT 'NGN',  -- accounting currency of the kobo columns
  subtotal_kobo        BIGINT NOT NULL CHECK (subtotal_kobo >= 0),
  discount_kobo        BIGINT NOT NULL DEFAULT 0 CHECK (discount_kobo >= 0),
  shipping_kobo        BIGINT CHECK (shipping_kobo IS NULL OR shipping_kobo >= 0),  -- NULL while awaiting quote
  total_kobo           BIGINT CHECK (total_kobo IS NULL OR total_kobo >= 0),
  refunded_kobo        BIGINT NOT NULL DEFAULT 0 CHECK (refunded_kobo >= 0),
  charge_currency      CHAR(3) NOT NULL DEFAULT 'NGN' CHECK (charge_currency IN ('NGN','USD')),
  charge_amount_minor  BIGINT CHECK (charge_amount_minor IS NULL OR charge_amount_minor > 0),
  charge_fx            JSONB,          -- { rate, source, fetched_at } when charge_currency <> currency
  display_currency     CHAR(3) NOT NULL DEFAULT 'NGN',
  display_fx           JSONB,          -- indicative conversion snapshot shown to the customer
  coupon_id            BIGINT REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code          TEXT,
  shipping_address     JSONB NOT NULL,
  shipping_method      JSONB NOT NULL, -- snapshot of method at order time
  delivery_instructions TEXT,
  carrier              TEXT,
  tracking_number      TEXT,
  tracking_url         TEXT,
  tracking_token       TEXT NOT NULL,     -- bearer link for guest order/request tracking (view-only)
  idempotency_key      TEXT UNIQUE,
  custom_request_id    BIGINT,
  needs_attention      BOOLEAN NOT NULL DEFAULT FALSE,
  attention_note       TEXT,
  internal_notes       TEXT,
  expires_at           TIMESTAMPTZ,
  paid_at              TIMESTAMPTZ,
  shipped_at           TIMESTAMPTZ,
  delivered_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (refunded_kobo <= COALESCE(total_kobo, 0)),
  CHECK (status = 'awaiting_quote' OR total_kobo IS NOT NULL)
);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_email_lower_idx ON orders (LOWER(email));
CREATE INDEX orders_created_idx ON orders (created_at DESC);
CREATE INDEX orders_pending_expiry_idx ON orders (expires_at) WHERE status = 'pending_payment';

CREATE TABLE order_items (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       BIGINT REFERENCES products(id) ON DELETE SET NULL,
  variant_id       BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  sku              TEXT NOT NULL,
  variant_label    TEXT,
  customizations   JSONB NOT NULL DEFAULT '{}',
  unit_price_kobo  BIGINT NOT NULL CHECK (unit_price_kobo >= 0),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  line_total_kobo  BIGINT NOT NULL CHECK (line_total_kobo = unit_price_kobo * quantity),
  image_url        TEXT,
  weight_grams     INTEGER,
  stock_reserved   BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_product_idx ON order_items (product_id);

CREATE TABLE order_events (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id             BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status               TEXT,
  note                 TEXT,
  visible_to_customer  BOOLEAN NOT NULL DEFAULT TRUE,
  actor_id             BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, created_at);

CREATE TABLE coupon_redemptions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coupon_id   BIGINT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id    BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  released    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX coupon_redemptions_email_idx ON coupon_redemptions (coupon_id, LOWER(email)) WHERE NOT released;

CREATE TABLE payments (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id                 BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider                 TEXT NOT NULL DEFAULT 'paystack',
  reference                TEXT NOT NULL UNIQUE,
  status                   TEXT NOT NULL DEFAULT 'initialized'
                           CHECK (status IN ('initialized','success','failed','abandoned','mismatch')),
  amount_minor             BIGINT NOT NULL CHECK (amount_minor > 0),
  currency                 CHAR(3) NOT NULL,
  provider_transaction_id  TEXT,
  channel                  TEXT,
  gateway_response         TEXT,
  authorization_url        TEXT,
  verified_at              TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX payments_order_idx ON payments (order_id);
-- At most one successful payment per order: prevents double fulfilment.
CREATE UNIQUE INDEX payments_one_success_per_order ON payments (order_id) WHERE status = 'success';

CREATE TABLE payment_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider      TEXT NOT NULL,
  dedupe_key    TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  reference     TEXT,
  payload       JSONB NOT NULL,     -- sanitised: card authorization details are stripped before storage
  processed_at  TIMESTAMPTZ,
  result        TEXT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, dedupe_key)
);

CREATE TABLE refunds (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id             BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_kobo          BIGINT NOT NULL CHECK (amount_kobo > 0),
  reason               TEXT,
  method               TEXT NOT NULL CHECK (method IN ('paystack','manual')),
  provider_reference   TEXT,
  status               TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','pending','processed','failed')),
  created_by           BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX refunds_order_idx ON refunds (order_id);

-- ---------------------------------------------------------------------------
-- Reviews (only approved reviews from real customers are ever displayed)
-- ---------------------------------------------------------------------------
CREATE TABLE reviews (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id         BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id            BIGINT REFERENCES users(id) ON DELETE SET NULL,
  display_name       TEXT NOT NULL,
  rating             SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title              TEXT,
  body               TEXT NOT NULL,
  verified_purchase  BOOLEAN NOT NULL DEFAULT FALSE,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moderated_at       TIMESTAMPTZ,
  moderated_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (product_id, user_id)
);
CREATE INDEX reviews_product_status_idx ON reviews (product_id, status);

-- ---------------------------------------------------------------------------
-- Custom and bulk orders
-- ---------------------------------------------------------------------------
CREATE TABLE custom_requests (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference            TEXT NOT NULL UNIQUE,
  kind                 TEXT NOT NULL CHECK (kind IN ('custom','bulk')),
  status               TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
                         'new','reviewing','quoted','approved','in_production','ready',
                         'completed','rejected','cancelled')),
  user_id              BIGINT REFERENCES users(id) ON DELETE SET NULL,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT NOT NULL,
  company              TEXT,
  country_code         CHAR(2),
  product_type         TEXT NOT NULL,
  occasion             TEXT,
  style_description    TEXT NOT NULL,
  colours              TEXT,
  quantity             INTEGER NOT NULL CHECK (quantity > 0),
  desired_date         DATE,
  budget_amount        BIGINT CHECK (budget_amount IS NULL OR budget_amount >= 0),  -- minor units of budget_currency
  budget_currency      CHAR(3),
  apparel              JSONB,       -- { garment_type, sizes: {S:2,...}, garment_colour, branding }
  details              JSONB NOT NULL DEFAULT '{}',
  tracking_token       TEXT NOT NULL,     -- bearer link for guest order/request tracking (view-only)
  quote_kobo           BIGINT CHECK (quote_kobo IS NULL OR quote_kobo > 0),
  quote_notes          TEXT,
  quote_valid_until    DATE,
  quoted_at            TIMESTAMPTZ,
  quoted_by            BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at          TIMESTAMPTZ,
  order_id             BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  internal_notes       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status NOT IN ('quoted','approved') OR quote_kobo IS NOT NULL)
);
CREATE INDEX custom_requests_status_idx ON custom_requests (status, created_at DESC);
ALTER TABLE orders ADD CONSTRAINT orders_custom_request_fk
  FOREIGN KEY (custom_request_id) REFERENCES custom_requests(id) ON DELETE SET NULL;

CREATE TABLE custom_request_files (
  request_id  BIGINT NOT NULL REFERENCES custom_requests(id) ON DELETE CASCADE,
  media_id    BIGINT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'reference' CHECK (role IN ('reference','logo')),
  PRIMARY KEY (request_id, media_id)
);

CREATE TABLE custom_request_events (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id           BIGINT NOT NULL REFERENCES custom_requests(id) ON DELETE CASCADE,
  status               TEXT,
  note                 TEXT,
  visible_to_customer  BOOLEAN NOT NULL DEFAULT TRUE,
  actor_id             BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX custom_request_events_req_idx ON custom_request_events (request_id, created_at);

-- ---------------------------------------------------------------------------
-- Content, settings, FX, messaging, audit, rate limiting
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE fx_snapshots (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  base        CHAR(3) NOT NULL DEFAULT 'NGN',
  rates       JSONB NOT NULL,          -- { "USD": 0.00068, ... } = units of currency per 1 NGN
  source      TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX fx_snapshots_fetched_idx ON fx_snapshots (fetched_at DESC);

CREATE TABLE newsletter_subscribers (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email            TEXT NOT NULL,
  source           TEXT,
  consented_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX newsletter_email_lower_key ON newsletter_subscribers (LOWER(email));

CREATE TABLE contact_messages (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  subject     TEXT,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','handled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_email  TEXT,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  details      JSONB NOT NULL DEFAULT '{}',
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

CREATE TABLE rate_limits (
  bucket        TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  hits          INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER categories_touch BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER products_touch BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER product_variants_touch BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER shipping_methods_touch BEFORE UPDATE ON shipping_methods FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER coupons_touch BEFORE UPDATE ON coupons FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER orders_touch BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER payments_touch BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER custom_requests_touch BEFORE UPDATE ON custom_requests FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
