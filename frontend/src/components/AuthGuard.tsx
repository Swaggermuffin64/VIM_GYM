import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

interface ProfileStub {
  has_completed_onboarding: boolean;
}

/**
 * Requires authentication and completed onboarding.
 * - No session → redirect to /login
 * - Session but onboarding incomplete → redirect to /onboarding
 * - Shows nothing while loading to avoid flash of redirect
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<ProfileStub | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setProfileLoading(false);
      return;
    }
    fetch(`${BACKEND_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((data: { success: boolean; profile?: ProfileStub }) => {
        if (data.success && data.profile) setProfile(data.profile);
      })
      .catch(() => {
        /* ignore — treat as onboarding not complete */
      })
      .finally(() => setProfileLoading(false));
  }, [session]);

  if (loading || profileLoading) return null;
  if (!session) return <Navigate to="/login" replace />;

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
