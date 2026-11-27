/**
 * Another player's profile page (/players/:id), reached by clicking a name on
 * the daily leaderboard rail. Same bento layout as your own profile
 * (components/profile/ProfileBento.tsx), read-only: no name editor, no
 * showcase picker.
 *
 * Signed-in only (wrapped in AuthGuard in App.tsx). Loads everything in one
 * call to GET /api/players/:id. Your own id redirects to /profile, where the
 * card is editable.
 */
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BrandedLoading } from '../components/BrandedLoading';
import {
  ProfileBento,
  ProfileMessage,
} from '../components/profile/ProfileBento';
import { fetchPlayer } from '../api/profile';
import type { FetchPlayerResult } from '../api/profile';

/** The /players/:id route's page component. */
export default function PlayerProfilePage() {
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const { session, user } = useAuth();
  const accessToken = session?.access_token ?? null;
  const isOwnProfile = user?.id === id;
  // Tagged with the id it was fetched for, so following a link to another
  // player shows the loading screen instead of the previous player's page.
  const [loaded, setLoaded] = useState<{
    id: string;
    result: FetchPlayerResult;
  } | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!accessToken || isOwnProfile) return;
    let cancelled = false;
    void fetchPlayer(accessToken, id).then((result) => {
      if (!cancelled) setLoaded({ id, result });
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, id, isOwnProfile]);

  if (isOwnProfile) return <Navigate to="/profile" replace />;

  const result = loaded?.id === id ? loaded.result : null;
  if (!result) return <BrandedLoading />;
  if (result.status === 'not_found') {
    return <ProfileMessage message="Player not found" />;
  }
  if (result.status === 'error') {
    return <ProfileMessage message="Couldn't load this profile." />;
  }

  const { profile, stats, daily } = result.player;
  return (
    <ProfileBento
      profile={profile}
      stats={stats}
      daily={daily}
      today={today}
      // Back to wherever the link was clicked (the daily page), or home
      // when the profile was opened directly.
      onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
    />
  );
}
