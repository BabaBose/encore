-- Book the Act schema (PostgreSQL).
--
-- Money is stored as integer minor units (fils) and dates as bare
-- `YYYY-MM-DD` text, matching the domain layer. Timestamps are ISO-8601 UTC
-- text rather than timestamptz, so a row round-trips through the app unchanged
-- and the date helpers stay the single place date arithmetic happens.

-- ---------------------------------------------------------------- accounts --

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  -- One of entertainer | venue | admin | agency. A single account is exactly
  -- one role; an entertainer who wants to book others signs up separately.
  role            TEXT NOT NULL CHECK (role IN ('entertainer','venue','admin','agency')),
  display_name    TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------------------------------------------------------------- taxonomy --

CREATE TABLE IF NOT EXISTS cities (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  country  TEXT NOT NULL,
  lat      DOUBLE PRECISION NOT NULL,
  lng      DOUBLE PRECISION NOT NULL
);

-- Admin-managed. Top-level categories carry no parent; genres hang off one.
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT REFERENCES categories(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  label      TEXT NOT NULL,
  accent     TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- ------------------------------------------------------------- performers --

CREATE TABLE IF NOT EXISTS entertainers (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  -- Set when an agency or manager lists on an act's behalf; disclosed publicly.
  managed_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  representation_note TEXT,

  slug                TEXT NOT NULL UNIQUE,
  stage_name          TEXT NOT NULL,
  real_name           TEXT,                      -- private; never returned publicly
  short_bio           TEXT NOT NULL DEFAULT '',
  full_bio            TEXT NOT NULL DEFAULT '',
  category_id         TEXT REFERENCES categories(id),
  home_city_id        TEXT REFERENCES cities(id),
  travel_radius_km    INTEGER NOT NULL DEFAULT 0,
  country_of_origin   TEXT NOT NULL DEFAULT '',
  team_size           INTEGER NOT NULL DEFAULT 1,
  languages           TEXT NOT NULL DEFAULT '[]', -- JSON array
  equipment_provided  TEXT NOT NULL DEFAULT '',
  equipment_required  TEXT NOT NULL DEFAULT '',
  profile_photo       TEXT,
  cover_accent        TEXT NOT NULL DEFAULT '#ff5fa2',

  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','pending_review','live','suspended')),
  review_note         TEXT,
  verified            BOOLEAN NOT NULL DEFAULT FALSE,
  featured            BOOLEAN NOT NULL DEFAULT FALSE,

  -- The two availability modes, set independently; both can be on at once.
  accepts_short_term  BOOLEAN NOT NULL DEFAULT TRUE,
  accepts_long_term   BOOLEAN NOT NULL DEFAULT FALSE,
  open_to_relocate    BOOLEAN NOT NULL DEFAULT FALSE,
  contract_lengths    TEXT NOT NULL DEFAULT '[]', -- JSON array of months
  -- Whether a calendar with dates already in the window takes this act out of
  -- residency searches. The act decides; a busy window is not a refusal.
  residency_inquiry_policy TEXT NOT NULL DEFAULT 'when_largely_free'
                        CHECK (residency_inquiry_policy IN ('when_largely_free','always')),

  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entertainers_status ON entertainers(status);
CREATE INDEX IF NOT EXISTS idx_entertainers_city ON entertainers(home_city_id);
CREATE INDEX IF NOT EXISTS idx_entertainers_manager ON entertainers(managed_by_user_id);

CREATE TABLE IF NOT EXISTS entertainer_genres (
  entertainer_id TEXT NOT NULL REFERENCES entertainers(id) ON DELETE CASCADE,
  genre_id       TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (entertainer_id, genre_id)
);

-- Cities an act has explicitly marked itself as travelling to, beyond radius.
CREATE TABLE IF NOT EXISTS entertainer_travel_cities (
  entertainer_id TEXT NOT NULL REFERENCES entertainers(id) ON DELETE CASCADE,
  city_id        TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  PRIMARY KEY (entertainer_id, city_id)
);

CREATE TABLE IF NOT EXISTS media (
  id             TEXT PRIMARY KEY,
  entertainer_id TEXT NOT NULL REFERENCES entertainers(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('video','photo')),
  url            TEXT NOT NULL,
  title          TEXT,
  accent         TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  -- Admin moderation: pending media stays off the public profile.
  moderation     TEXT NOT NULL DEFAULT 'approved'
                   CHECK (moderation IN ('pending','approved','rejected')),
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_entertainer ON media(entertainer_id, kind);

CREATE TABLE IF NOT EXISTS awards (
  id             TEXT PRIMARY KEY,
  entertainer_id TEXT NOT NULL REFERENCES entertainers(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  issuer         TEXT NOT NULL,
  year           INTEGER NOT NULL
);

-- Self-submitted reference quotes. Shown separately from verified reviews so a
-- venue can always tell platform-verified feedback from a quote the act added.
CREATE TABLE IF NOT EXISTS references_quotes (
  id             TEXT PRIMARY KEY,
  entertainer_id TEXT NOT NULL REFERENCES entertainers(id) ON DELETE CASCADE,
  quote          TEXT NOT NULL,
  client_name    TEXT NOT NULL,
  gig_date       TEXT,
  logo_accent    TEXT,
  moderation     TEXT NOT NULL DEFAULT 'pending'
                   CHECK (moderation IN ('pending','approved','rejected')),
  created_at     TEXT NOT NULL
);

-- ------------------------------------------------------------------- rates --

CREATE TABLE IF NOT EXISTS rate_cards (
  entertainer_id        TEXT PRIMARY KEY REFERENCES entertainers(id) ON DELETE CASCADE,
  currency              TEXT NOT NULL DEFAULT 'AED',
  base_hourly           BIGINT NOT NULL DEFAULT 0,
  minimum_hours         INTEGER NOT NULL DEFAULT 1,
  residency_weekly      BIGINT,
  residency_monthly     BIGINT,
  days_per_week_included INTEGER NOT NULL DEFAULT 5,
  extra_day_rate        BIGINT,
  published             BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TEXT NOT NULL
);

-- The [day-of-week] x [time block] grid.
CREATE TABLE IF NOT EXISTS rate_rules (
  id             TEXT PRIMARY KEY,
  entertainer_id TEXT NOT NULL REFERENCES entertainers(id) ON DELETE CASCADE,
  weekday        INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Monday
  time_block     TEXT NOT NULL CHECK (time_block IN ('daytime','evening','late_night')),
  hourly         BIGINT NOT NULL,
  minimum_hours  INTEGER,
  UNIQUE (entertainer_id, weekday, time_block)
);

CREATE TABLE IF NOT EXISTS special_date_rates (
  id             TEXT PRIMARY KEY,
  entertainer_id TEXT NOT NULL REFERENCES entertainers(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  label          TEXT NOT NULL,
  hourly         BIGINT NOT NULL,
  minimum_hours  INTEGER,
  UNIQUE (entertainer_id, date)
);

-- ------------------------------------------------------------- availability --

CREATE TABLE IF NOT EXISTS availability_blocks (
  id             TEXT PRIMARY KEY,
  entertainer_id TEXT NOT NULL REFERENCES entertainers(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('single','range','recurring_weekday')),
  -- 'booking' blocks are placed by a confirmation and cannot be lifted by hand.
  source         TEXT NOT NULL CHECK (source IN ('manual','booking')),
  start_date     TEXT,
  end_date       TEXT,
  weekday        INTEGER,
  recur_from     TEXT,
  recur_until    TEXT,
  inquiry_id     TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blocks_entertainer ON availability_blocks(entertainer_id);
CREATE INDEX IF NOT EXISTS idx_blocks_inquiry ON availability_blocks(inquiry_id);

-- ------------------------------------------------------------------ venues --

CREATE TABLE IF NOT EXISTS venues (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  venue_type  TEXT NOT NULL DEFAULT 'restaurant',
  city_id     TEXT REFERENCES cities(id),
  accent      TEXT NOT NULL DEFAULT '#5fb0ff',
  created_at  TEXT NOT NULL
);

-- Named collections, so several acts considered for the same gig stay together.
CREATE TABLE IF NOT EXISTS shortlists (
  id         TEXT PRIMARY KEY,
  venue_id   TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shortlist_items (
  shortlist_id   TEXT NOT NULL REFERENCES shortlists(id) ON DELETE CASCADE,
  entertainer_id TEXT NOT NULL REFERENCES entertainers(id) ON DELETE CASCADE,
  added_at       TEXT NOT NULL,
  PRIMARY KEY (shortlist_id, entertainer_id)
);

-- --------------------------------------------------------------- inquiries --

CREATE TABLE IF NOT EXISTS inquiries (
  id              TEXT PRIMARY KEY,
  venue_id        TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  entertainer_id  TEXT NOT NULL REFERENCES entertainers(id) ON DELETE CASCADE,
  gig_type        TEXT NOT NULL CHECK (gig_type IN ('one_time','long_term')),

  -- Short-term: an exact date or run, plus hours and the time block priced.
  start_date      TEXT,
  end_date        TEXT,
  time_block      TEXT,
  hours           DOUBLE PRECISION,

  -- Long-term: a duration with a target start, per the spec.
  months          INTEGER,
  days_per_week   INTEGER,

  city_id         TEXT REFERENCES cities(id),
  event_type      TEXT,
  notes           TEXT,

  -- What the rate rules resolved to, and what is actually on the table now.
  currency        TEXT NOT NULL DEFAULT 'AED',
  quoted_amount   BIGINT NOT NULL,
  offer_amount    BIGINT NOT NULL,
  rate_basis      TEXT NOT NULL DEFAULT 'hourly',

  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','viewed','accepted','countered','declined',
                                      'confirmed','completed','cancelled')),
  cancel_reason   TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inquiries_venue ON inquiries(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_inquiries_entertainer ON inquiries(entertainer_id, status);

-- Append-only audit of every state change, with the actor and logged reason.
CREATE TABLE IF NOT EXISTS inquiry_events (
  id          TEXT PRIMARY KEY,
  inquiry_id  TEXT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor       TEXT NOT NULL,
  actor_id    TEXT,
  reason      TEXT,
  offer       BIGINT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inquiry_events ON inquiry_events(inquiry_id, created_at);

-- One thread per inquiry, so negotiation stays on-platform. It persists after
-- confirmation for logistics.
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  inquiry_id  TEXT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  read_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_inquiry ON messages(inquiry_id, created_at);

-- Verified reviews: only ever from a completed booking, hence the unique key.
CREATE TABLE IF NOT EXISTS reviews (
  id             TEXT PRIMARY KEY,
  inquiry_id     TEXT NOT NULL UNIQUE REFERENCES inquiries(id) ON DELETE CASCADE,
  entertainer_id TEXT NOT NULL REFERENCES entertainers(id) ON DELETE CASCADE,
  venue_id       TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body           TEXT NOT NULL DEFAULT '',
  moderation     TEXT NOT NULL DEFAULT 'approved'
                   CHECK (moderation IN ('pending','approved','rejected')),
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_entertainer ON reviews(entertainer_id);

-- ----------------------------------------------------------- notifications --

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  link        TEXT,
  read_at     TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

-- ------------------------------------------------------------ subscriptions --

-- The platform charges entertainers a subscription rather than taking a
-- booking commission, so a lapsed subscription is what gates listing.
CREATE TABLE IF NOT EXISTS subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan        TEXT NOT NULL DEFAULT 'standard',
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('trialing','active','past_due','cancelled')),
  renews_at   TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

-- ------------------------------------------------------------ data API lock --

-- Supabase publishes the `public` schema through PostgREST, so without this
-- every table here — password hashes and session tokens included — would be
-- readable with the project's anon key.
--
-- The app does not use that API at all: it connects over Postgres as the table
-- owner, which bypasses RLS. Enabling RLS and defining no policies therefore
-- shuts the HTTP door completely while leaving the app untouched. The REVOKE
-- is belt and braces, so a permissive policy added later still grants nothing
-- on its own.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;
