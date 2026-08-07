import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Requires authentication and completed onboarding.
 * - No session → redirect to /login
 * - Profile fetch rejected (expired/revoked token) → /login
 *   (AuthContext already signs the user out when this happens)
 * - Profile fetch unreachable (backend down/throttled) → retryable error, session left alone
 * - Onboarding incomplete → redirect to /onboarding
 * - Shows nothing while loading to avoid a flash of redirect or protected content
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading, profile, profileStatus } = useAuth();
  const location = useLocation();

  if (loading || (session && profileStatus === 'loading')) return null;
  if (!session || profileStatus === 'rejected') {
    return <Navigate to="/login" replace />;
  }

  if (profileStatus === 'unreachable') {
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
