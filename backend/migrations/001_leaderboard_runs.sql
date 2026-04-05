-- Leaderboard runs + optional replay payload (ordered practice tasks as JSON).
-- Apply in Supabase: SQL Editor, or `psql`, or your migration runner.

CREATE TABLE IF NOT EXISTS leaderboard_runs (
  id BIGSERIAL PRIMARY KEY,

  play_mode TEXT NOT NULL,

  -- Single-task leaderboard: set task_id, task_type, duration_ms; tasks_json usually NULL.
  -- Session replay: set tasks_json (and duration_ms for total/session time); task_id/task_type may be NULL.
  task_id TEXT,
  task_type TEXT
    CHECK (task_type IS NULL OR task_type IN ('navigate', 'delete', 'insert', 'change')),

  duration_ms INTEGER NOT NULL
    CHECK (duration_ms > 0),

  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  player_id TEXT,
  display_name TEXT,
  room_id TEXT,

  -- Ordered Task[] from the API / client (e.g. full shuffled practice session for exact replay).
  tasks_json JSONB,
  task_schema_version SMALLINT NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT leaderboard_runs_single_task_or_session
    CHECK (
      (tasks_json IS NULL AND task_id IS NOT NULL AND task_type IS NOT NULL)
      OR (tasks_json IS NOT NULL AND jsonb_typeof(tasks_json) = 'array')
    )
);

COMMENT ON COLUMN leaderboard_runs.play_mode IS 'e.g. practice, quick_play — app-defined strings; extend without enum migrations.';
COMMENT ON COLUMN leaderboard_runs.tasks_json IS 'When set, ordered JSON array of Task objects for exact replay (e.g. full practice session).';
COMMENT ON COLUMN leaderboard_runs.task_schema_version IS 'Bump when Task JSON shape changes; use for migrations or strict clients.';

-- Cast form must be parenthesized for expression indexes (see PostgreSQL CREATE INDEX docs).
CREATE INDEX IF NOT EXISTS leaderboard_runs_day_mode_task_idx
  ON leaderboard_runs (
    CAST(achieved_at AT TIME ZONE 'UTC' AS date),
    play_mode,
    task_id
  )
  WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS leaderboard_runs_achieved_at_idx
  ON leaderboard_runs (achieved_at DESC);
