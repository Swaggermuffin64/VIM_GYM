-- backend/migrations/002_profiles_and_auth.sql

-- 1. Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  has_completed_onboarding BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Auto-create profile on new auth user
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1),
      'player'
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3. Backfill profiles for users who signed up before the trigger existed.
--    Mirrors handle_new_user() so pre-existing and new accounts look identical.
INSERT INTO public.profiles (id, display_name, avatar_url)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1),
    'player'
  ),
  u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- 4. Add user_id and is_pre_auth to leaderboard_runs
ALTER TABLE leaderboard_runs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS is_pre_auth BOOLEAN NOT NULL DEFAULT false;

-- Mark all existing rows as pre-auth (they have no real user_id)
UPDATE leaderboard_runs SET is_pre_auth = true WHERE user_id IS NULL;
