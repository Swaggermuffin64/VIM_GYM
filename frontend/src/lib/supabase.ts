import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

/**
 * False in local dev without Supabase credentials. The app still renders as a
 * signed-out visitor; sign-in is disabled. Production builds require both
 * vars (see vite.config.ts), so this is never false in a deployed bundle.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set: sign-in is disabled. ' +
      'See frontend/.env.example.'
  );
}

// With no stored session, a placeholder client makes no network calls, so
// auth lookups simply resolve to "signed out".
export const supabase = createClient(
  supabaseUrl || 'http://supabase.invalid',
  supabaseAnonKey || 'missing-anon-key'
);
