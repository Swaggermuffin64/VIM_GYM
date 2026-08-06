import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

interface ProfileStub {
  has_completed_onboarding: boolean;
}

/**
 * Outcome of checking the current session against the backend.
 * - `loading`   — check in flight; render nothing to avoid a flash
 * - `ready`     — token accepted, profile loaded
 * - `rejected`  — token refused (401); the session is dead
 * - `unreachable` — backend down, throttled, or erroring; the session may
 *                   still be perfectly valid, so it must be left alone
 */
type ProfileCheck = 'loading' | 'ready' | 'rejected' | 'unreachable';

/**
 * Requires authentication and completed onboarding.
 * - No session → redirect to /login
 * - Session but backend rejects it (expired/revoked token) → sign out, then /login
 * - Session but backend unreachable → show a retryable error, keep the session
 * - Session but onboarding incomplete → redirect to /onboarding
 * - Shows nothing while loading to avoid flash of redirect or protected content
 *
 * Signing out on rejection is what keeps this from looping: /login redirects
 * any live session back here, so leaving a rejected token in place would make
 * the two pages bounce a request off the backend until it rate-limits us.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<ProfileStub | null>(null);
  const [check, setCheck] = useState<ProfileCheck>('loading');

  useEffect(() => {
    if (!session) {
      setCheck('rejected');
      return;
    }

    let abandoned = false;
    setCheck('loading');

    const loadProfile = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/user/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.status === 401) {
          // The token is genuinely no longer valid (expired or revoked).
          await supabase.auth.signOut();
          if (!abandoned) setCheck('rejected');
          return;
        }

        if (!response.ok) {
          if (!abandoned) setCheck('unreachable');
          return;
        }

        const data = (await response.json()) as {
          success: boolean;
          profile?: ProfileStub;
        };
        if (abandoned) return;

        if (data.success && data.profile) {
          setProfile(data.profile);
          setCheck('ready');
        } else {
          setCheck('unreachable');
        }
      } catch {
        if (!abandoned) setCheck('unreachable');
      }
    };

    void loadProfile();
    return () => {
      abandoned = true;
    };
  }, [session]);

  if (loading || check === 'loading') return null;
  if (!session || check === 'rejected') return <Navigate to="/login" replace />;

  if (check === 'unreachable') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          background: '#000000',
          color: '#e5e5e5',
          fontFamily: '"JetBrains Mono", monospace',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, fontSize: '14px' }}>
          Couldn&apos;t reach the server to verify your session.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            borderRadius: '6px',
            border: '1px solid #333',
            background: '#111',
            color: '#e5e5e5',
            fontSize: '13px',
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  // Skip onboarding redirect when already on onboarding page
  if (
    profile &&
    !profile.has_completed_onboarding &&
    location.pathname !== '/onboarding'
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
