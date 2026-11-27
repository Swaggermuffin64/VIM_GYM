/**
 * Your own profile page (/profile): the shared bento layout
 * (components/profile/ProfileBento.tsx) with an editable name and showcase.
 * Another player's read-only profile is pages/player.tsx.
 *
 * Loads identity (/api/user/me), stats (/api/user/stats) and the daily
 * profile (/api/daily/profile) in parallel, once each. An identity failure
 * shows an error; a stats or daily failure just leaves those tiles empty.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BrandedLoading } from '../components/BrandedLoading';
import {
  ProfileBento,
  ProfileMessage,
} from '../components/profile/ProfileBento';
import { formatDuration, ordinal } from '../lib/format';
import { fetchDailyProfile } from '../api/daily';
import type { DailyProfile } from '../api/daily';
import { fetchMe, fetchPlayerStats, saveShowcase } from '../api/profile';
import type { PlayerStats, Profile } from '../api/profile';

export { formatDuration, ordinal };

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/** The profile route's page component. */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { session, applyProfileUpdate } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [daily, setDaily] = useState<DailyProfile | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    Promise.all([
      fetchMe(accessToken),
      fetchPlayerStats(accessToken),
      fetchDailyProfile(accessToken),
    ]).then(([me, playerStats, dailyProfile]) => {
      if (cancelled) return;
      if ('error' in me) {
        setError(me.error);
        return;
      }
      setProfile(me);
      setStats(playerStats);
      setDaily(dailyProfile);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  /** Saves a new display name; resolves to an error message, or null on success. */
  const saveName = async (name: string): Promise<string | null> => {
    if (!accessToken) return 'Not signed in';
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ display_name: name }),
      });
      const data: {
        success: boolean;
        profile?: { display_name: string };
        error?: string;
      } = await res.json();
      if (data.success && data.profile) {
        const savedName = data.profile.display_name;
        setProfile((prev) =>
          prev ? { ...prev, displayName: savedName } : prev
        );
        // Sync the shared auth profile so the site banner shows the new name.
        // AuthContext expects the server's snake_case shape, so pass it as-is.
        applyProfileUpdate(
          data.profile as Parameters<typeof applyProfileUpdate>[0]
        );
        return null;
      }
      return data.error ?? 'Failed to save name';
    } catch {
      return 'Network error';
    }
  };

  /** Saves the showcased badges; resolves to an error message, or null on success. */
  const saveShowcaseBadges = async (ids: string[]): Promise<string | null> => {
    if (!accessToken) return 'Not signed in';
    const result = await saveShowcase(accessToken, ids);
    if (!result.ok) return result.error;
    setProfile((prev) =>
      prev ? { ...prev, showcasedBadges: result.ids } : prev
    );
    return null;
  };

  if (error) return <ProfileMessage message={error} />;

  // Same amber-ring loading screen the other routes show, until /me, stats
  // and the daily profile have all answered.
  if (!profile) return <BrandedLoading />;

  return (
    <ProfileBento
      profile={profile}
      stats={stats}
      daily={daily}
      today={today}
      onSaveName={saveName}
      onSaveShowcase={saveShowcaseBadges}
      onBack={() => navigate('/')}
    />
  );
}
