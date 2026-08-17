-- backend/migrations/005_daily_races.sql
-- Race of the Day (spec: docs/superpowers/specs/2026-08-15-race-of-the-day-design.md).
-- Additive only. Apply after 001-004 via Supabase SQL Editor or psql.
BEGIN;

-- One row per UTC day. Created lazily by the first /api/daily request;
-- task_hashes reference rows the backend upserts into tasks at creation time,
-- so any past day's set is permanently reconstructable.
CREATE TABLE IF NOT EXISTS daily_races (
  race_date   DATE PRIMARY KEY,            -- UTC day
  task_hashes TEXT[] NOT NULL,             -- ordered refs into tasks (10 entries)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per attempt SLOT, inserted at claim time with NULL duration and
-- finalized on completion. A row that keeps NULL duration is an abandoned
-- attempt: it still counts toward the 3-per-day cap but never ranks.
CREATE TABLE IF NOT EXISTS daily_attempts (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES profiles(id),
  race_date      DATE NOT NULL REFERENCES daily_races(race_date),
  attempt_number SMALLINT NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  game_id        BIGINT REFERENCES games(id),  -- stats-parity session for this attempt
  duration_ms    INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, race_date, attempt_number)
);

-- Leaderboard query path: best finished time per user per day.
CREATE INDEX IF NOT EXISTS daily_attempts_race_best_idx
  ON daily_attempts (race_date, duration_ms) WHERE duration_ms IS NOT NULL;

-- One share slug per (user, day), created on demand; slug resolves to
-- name + placing for the Slack/Discord unfurl and the login-page taunt.
CREATE TABLE IF NOT EXISTS daily_share_links (
  slug       TEXT PRIMARY KEY,             -- short random base62
  user_id    UUID NOT NULL REFERENCES profiles(id),
  race_date  DATE NOT NULL REFERENCES daily_races(race_date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, race_date)
);

-- Backend connects as table owner; RLS with no policies blocks PostgREST.
ALTER TABLE daily_races       ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_share_links ENABLE ROW LEVEL SECURITY;

COMMIT;
