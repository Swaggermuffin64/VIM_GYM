import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_premium: boolean;
  has_completed_onboarding: boolean;
}

export type ProfileStatus = 'loading' | 'ready' | 'rejected' | 'unreachable';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True while the initial session check is in flight */
  loading: boolean;
  profile: Profile | null;
  /** Status of the profile fetch for the current session — see fetchProfile */
  profileStatus: ProfileStatus;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  profile: null,
  profileStatus: 'loading',
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');

  useEffect(() => {
    // Load existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Keep session in sync with Supabase auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Key the profile fetch on the token string, not the session object:
  // supabase re-emits a NEW session object for events like INITIAL_SESSION
  // and TOKEN_REFRESHED even when nothing changed, and refetching on every
  // re-emission would blank all AuthGuard-protected pages.
  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    if (!accessToken) {
      setProfile(null);
      setProfileStatus('rejected');
      return;
    }

    let abandoned = false;
    // Keep the current profile visible while revalidating (e.g. after a
    // token refresh); only show 'loading' when there is no profile yet.
    setProfileStatus((prev) => (prev === 'ready' ? prev : 'loading'));

    const loadProfile = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/user/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.status === 401) {
          // The token is genuinely no longer valid (expired or revoked).
          await supabase.auth.signOut();
          if (!abandoned) setProfileStatus('rejected');
          return;
        }

        if (!response.ok) {
          if (!abandoned) setProfileStatus('unreachable');
          return;
        }

        const data = (await response.json()) as {
          success: boolean;
          profile?: Profile;
        };
        if (abandoned) return;

        if (data.success && data.profile) {
          setProfile(data.profile);
          setProfileStatus('ready');
        } else {
          setProfileStatus('unreachable');
        }
      } catch {
        if (!abandoned) setProfileStatus('unreachable');
      }
    };

    void loadProfile();
    return () => {
      abandoned = true;
    };
  }, [accessToken]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        profile,
        profileStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
