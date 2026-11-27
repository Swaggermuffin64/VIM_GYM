-- backend/migrations/008_daily_badges.sql
-- Daily efficiency board + badges (spec: docs/superpowers/specs/2026-10-19-daily-efficiency-badges-replays-design.md).
-- Additive only. Apply after 001-007 via Supabase SQL Editor or psql.
BEGIN;

-- Badge ids the user has already been shown in the "you earned badges"
-- toast. Badges themselves are computed from daily_attempts at read time;
-- only this acknowledgement is stored.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS seen_badges TEXT[] NOT NULL DEFAULT '{}';

-- Efficiency scoring looks up each daily attempt's per-task keystroke rows
-- by (game_id, task_hash); without this it scans task_attempts per task.
CREATE INDEX IF NOT EXISTS task_attempts_game_task_idx
  ON task_attempts (game_id, task_hash);

COMMIT;
