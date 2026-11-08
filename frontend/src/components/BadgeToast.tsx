/**
 * One-time "you earned badges" toast for Race of the Day. Badges are awarded
 * retroactively, so existing players see everything they've already earned
 * the first time they open the site after launch; after that it announces
 * each newly earned badge once.
 *
 * Checks once per signed-in user per page load, and only on calm pages (not
 * mid-race), via GET /api/daily/profile's unseen_badges. Badges are marked
 * seen as soon as the toast shows, so ignoring it doesn't re-announce them
 * on every visit.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchDailyProfile, markBadgesSeen } from '../api/daily';
import type { EarnedBadge } from '../api/daily';
import { badgeInfo } from '../lib/dailyBadges';
import { StatusSegment } from './StatusSegment';
import { colors } from '../theme';

/** Routes the toast may appear on: never over a race in progress. */
const TOAST_ROUTES = new Set(['/', '/profile', '/about']);

/** Badges listed by name; the rest collapse into "+N more". */
const LISTED_BADGES = 3;

const styles: Record<string, React.CSSProperties> = {
  toast: {
    position: 'fixed',
    bottom: '24px',
    left: '16px',
    right: '16px',
    marginLeft: 'auto',
    maxWidth: '360px',
    zIndex: 1000,
    padding: '18px 20px',
    borderRadius: '12px',
    border: `1px solid ${colors.primary}60`,
    background: colors.bgCard,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.textPrimary,
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  title: { fontSize: '16px', fontWeight: 700, margin: 0 },
  close: {
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '16px',
    padding: 0,
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: '12px 0 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '14px',
  },
  item: { display: 'flex', alignItems: 'center', gap: '10px' },
  more: { color: colors.textMuted },
  cta: {
    marginTop: '14px',
    padding: '8px 14px',
    fontSize: '14px',
    fontWeight: 700,
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    background: colors.primary,
    color: '#000',
    fontFamily: 'inherit',
  },
};

export function BadgeToast() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [badges, setBadges] = useState<EarnedBadge[] | null>(null);
  // The user already checked on this page load; token refreshes don't recheck.
  const checkedFor = useRef<string | null>(null);

  const token = session?.access_token ?? null;
  const userId = session?.user?.id ?? null;
  const eligible = TOAST_ROUTES.has(pathname);

  useEffect(() => {
    if (!token || !userId || !eligible || checkedFor.current === userId) {
      return;
    }
    checkedFor.current = userId;
    void fetchDailyProfile(token).then((profile) => {
      // Ids this build doesn't know (a newer server) can't be shown by name.
      const unseen = (profile?.unseenBadges ?? []).filter((b) =>
        badgeInfo(b.id)
      );
      if (unseen.length === 0) return;
      setBadges(unseen);
      void markBadgesSeen(
        token,
        unseen.map((b) => b.id)
      );
    });
  }, [token, userId, eligible]);

  if (!badges) return null;

  const listed = badges.slice(0, LISTED_BADGES);
  const hidden = badges.length - listed.length;

  return (
    <div role="status" aria-live="polite" style={styles.toast}>
      <div style={styles.head}>
        <p style={styles.title}>
          You&apos;ve earned {badges.length}{' '}
          {badges.length === 1 ? 'badge' : 'badges'}!
        </p>
        <button
          style={styles.close}
          aria-label="Dismiss"
          onClick={() => setBadges(null)}
        >
          ✕
        </button>
      </div>
      <ul style={styles.list}>
        {listed.map((b) => {
          const info = badgeInfo(b.id)!;
          return (
            <li key={b.id} style={styles.item}>
              <span aria-hidden="true">
                <StatusSegment
                  kind={info.kind}
                  label={info.label}
                  value={info.value}
                  size="sm"
                />
              </span>
              {info.name}
            </li>
          );
        })}
        {hidden > 0 && <li style={styles.more}>+{hidden} more</li>}
      </ul>
      {pathname !== '/profile' && (
        <button
          style={styles.cta}
          onClick={() => {
            setBadges(null);
            navigate('/profile');
          }}
        >
          See your profile →
        </button>
      )}
    </div>
  );
}
