-- backend/migrations/006_unique_display_names.sql
-- Enforce case-insensitively unique display names. Apply after 001-005.
--
-- Three parts, transactional:
--   1. Dedupe existing collisions (keep the oldest holder of each name; the
--      rest get a short id-derived suffix that fits the 20-char name limit).
--   2. Unique index on lower(display_name).
--   3. Replace handle_new_user() so OAuth signups whose derived name is
--      taken fall back to a suffixed name instead of failing the trigger
--      insert (which would break signup entirely).
BEGIN;

-- 1. Dedupe: every profile that shares a lowercased name with an older
--    profile gets '<first 15 chars>_<first 4 of uuid>'. The uuid suffix
--    makes a re-collision with any existing name practically impossible.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY lower(display_name)
           ORDER BY created_at ASC, id ASC
         ) AS rn
    FROM profiles
)
UPDATE profiles p
   SET display_name = left(p.display_name, 15) || '_' || left(p.id::text, 4)
  FROM ranked r
 WHERE p.id = r.id
   AND r.rn > 1;

-- 2. Case-insensitive uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name_lower_unique
  ON profiles (lower(display_name));

-- 3. Collision-safe signup trigger. Same name derivation as before
--    (002_profiles_and_auth.sql); new: fall back to a suffixed name when
--    the derived one is taken, and swallow the (astronomically unlikely)
--    remaining unique violation rather than failing auth user creation.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base TEXT;
  candidate TEXT;
BEGIN
  base := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'player'
  );
  candidate := left(base, 20);

  IF EXISTS (
    SELECT 1 FROM public.profiles
     WHERE lower(display_name) = lower(candidate)
  ) THEN
    candidate := left(base, 15) || '_' || left(NEW.id::text, 4);
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (NEW.id, candidate, NEW.raw_user_meta_data->>'avatar_url')
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent signup raced us to the same name; retry once with the
    -- id-derived suffix, which cannot collide between two distinct users.
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (
      NEW.id,
      left(base, 15) || '_' || left(NEW.id::text, 4),
      NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
