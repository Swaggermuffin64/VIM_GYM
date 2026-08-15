-- backend/migrations/003_games_and_stats.sql
-- Additive only: no existing table is touched. Apply after 001/002.
BEGIN;

-- Dimension: one row per distinct generated task, keyed by content hash.
-- Rows are written on first use (session start), NOT at pool generation.
CREATE TABLE IF NOT EXISTS tasks (
  content_hash  TEXT PRIMARY KEY,          -- sha256 hex of canonical task JSON (see taskHash.ts)
  task_type     TEXT NOT NULL,
  task_json     JSONB NOT NULL,
  optimal_keystroke_count INTEGER,         -- from recommendedSequence; NULL when no recommendation
  task_schema_version SMALLINT NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per bounded session: multiplayer race OR practice session.
CREATE TABLE IF NOT EXISTS games (
  id          BIGSERIAL PRIMARY KEY,
  play_mode   TEXT NOT NULL,               -- practice | quick_play | private_match
  room_id     TEXT,                        -- NULL for practice
  task_hashes TEXT[] NOT NULL,             -- ordered refs into tasks
  started_at  TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ                  -- NULL while running / if abandoned
);

-- One row per signed-in participant per game/session.
CREATE TABLE IF NOT EXISTS game_players (
  game_id       BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id       UUID   NOT NULL REFERENCES profiles(id),
  position      INTEGER,                   -- finishing order: 1 = winner, dense 1..N over finishers only.
                                           -- NULL for practice sessions and for players who never finished
                                           -- (left_race = true). Schema is N-player ready; the ranking rule
                                           -- for finishes after an opponent leaves lives in app code.
  total_time_ms INTEGER,
  finished      BOOLEAN NOT NULL DEFAULT false,
  left_race     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (game_id, user_id)
);

-- Fact table: one row per completed task attempt, any mode.
CREATE TABLE IF NOT EXISTS task_attempts (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  task_hash       TEXT NOT NULL REFERENCES tasks(content_hash),
  game_id         BIGINT NOT NULL REFERENCES games(id),
  play_mode       TEXT NOT NULL,           -- denormalized from games for cheap filtering
  duration_ms     INTEGER NOT NULL CHECK (duration_ms > 0),
  -- NULL when the multiplayer keystroke submission hasn't arrived (or never does).
  keystroke_count INTEGER CHECK (keystroke_count IS NULL OR keystroke_count > 0),
  keystrokes      JSONB,                   -- [{k, t}] <= 50 events; NULL if invalid/oversized/not yet attached
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_attempts_user_time_idx ON task_attempts (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS task_attempts_task_idx      ON task_attempts (task_hash);
CREATE INDEX IF NOT EXISTS game_players_user_idx       ON game_players (user_id);

COMMIT;
