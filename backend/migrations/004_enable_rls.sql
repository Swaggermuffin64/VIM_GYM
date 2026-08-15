-- backend/migrations/004_enable_rls.sql
--
-- Enable row level security on every user-data table. The backend talks to
-- Postgres as the table owner (RLS does not apply to owners), but Supabase
-- also exposes these tables over PostgREST to the anon/authenticated roles.
-- Enabling RLS with NO policies denies those roles all reads and writes, so
-- the backend API stays the only path to this data.
--
-- If the frontend ever needs direct Supabase reads (e.g. public profiles),
-- add an explicit narrow policy here rather than disabling RLS.

BEGIN;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attempts ENABLE ROW LEVEL SECURITY;

COMMIT;
