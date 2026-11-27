-- backend/migrations/009_showcased_badges.sql
-- Profile page redesign: badges a player chooses to feature on their profile.
-- Additive only. Apply after 001-008 via Supabase SQL Editor or psql.
BEGIN;

-- Up to 3 badge ids (validated in the API, see validateShowcase); badges
-- themselves are still computed from daily_attempts at read time.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS showcased_badges TEXT[] NOT NULL DEFAULT '{}';

COMMIT;
