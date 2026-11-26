/**
 * The profile page's main card: inline-editable display name, member
 * since / Premium, the showcased badges (with a picker to change them) and a
 * four-number daily strip (days raced, daily wins, best finish, total runs).
 *
 * Presentational plus local UI state (editing name, choosing showcase). All
 * saving is delegated to the page through `onSaveName` / `onSaveShowcase`,
 * which resolve to an error message, or null on success.
 */
import React, { useState } from 'react';
import type { DailyProfile } from '../../api/daily';
import type { PlayerStats, Profile } from '../../api/profile';
import { formatPlacing } from '../../lib/format';
import { bestFinish, showcaseBadges } from '../../lib/profileView';
import { badgeInfo } from '../../lib/dailyBadges';
import type { BadgeInfo } from '../../lib/dailyBadges';
import { colors } from '../../theme';
import { StatusSegment } from '../StatusSegment';
import { ShowcasePicker } from './ShowcasePicker';
import { meta, sectionLabel } from './tileStyles';

const NO_VALUE = '—';

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderTop: `3px solid ${colors.primary}`,
    borderRadius: '14px',
    padding: '26px',
    boxSizing: 'border-box',
    color: colors.textPrimary,
    fontSize: '15px',
  },
  top: { display: 'flex', gap: '18px', alignItems: 'center' },
  identity: { flex: 1, minWidth: 0 },
  nameRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  name: { fontSize: '30px', fontWeight: 800, margin: 0 },
  nameInput: {
    fontSize: '26px',
    fontWeight: 700,
    color: colors.textPrimary,
    background: colors.bgCard,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: '8px',
    padding: '6px 10px',
    fontFamily: 'inherit',
    width: '280px',
    maxWidth: '100%',
  },
  smallButton: {
    fontSize: '15px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    background: colors.primary,
    color: '#000',
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  smallButtonMuted: {
    fontSize: '15px',
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    background: 'transparent',
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    fontFamily: 'inherit',
  },
  iconButton: {
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '20px',
    padding: '4px',
  },
  linkButton: {
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: 'inherit',
    padding: 0,
  },
  error: { fontSize: '15px', color: '#f87171', margin: '4px 0 0' },
  premium: { color: colors.primaryLight },
  showcase: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  strip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    marginTop: '20px',
    borderTop: `1px solid ${colors.border}`,
    paddingTop: '16px',
  },
  big: { margin: 0, fontSize: '28px', fontWeight: 800 },
};

/** One strip column: a big value over its uppercase label. */
function StripStat({
  label,
  value,
  color,
  first,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
  first?: boolean;
}) {
  return (
    <div
      style={
        first
          ? undefined
          : { borderLeft: `1px solid ${colors.border}`, paddingLeft: '16px' }
      }
    >
      <p style={{ ...styles.big, color: color ?? colors.textPrimary }}>
        {value}
      </p>
      <p style={sectionLabel}>{label}</p>
    </div>
  );
}

/** A daily placing like "4/44", with the field size ("/44") muted. */
function Placing({ rank, racers }: { rank: number; racers: number }) {
  const placing = formatPlacing(rank, racers);
  const slash = placing.indexOf('/');
  return (
    <>
      {placing.slice(0, slash)}
      <span style={{ fontSize: '14px', color: colors.textMuted }}>
        {placing.slice(slash)}
      </span>
    </>
  );
}

/** "2026-05-01T..." -> "May 2026"; empty string when absent/invalid. */
function formatMemberSince(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Name heading with an edit pencil, or the inline editor once editing. */
function NameEditor({
  displayName,
  onSaveName,
}: {
  displayName: string;
  onSaveName: (name: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setDraft(displayName);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const failure = await onSaveName(draft);
    setSaving(false);
    if (failure) setError(failure);
    else setEditing(false);
  };

  return (
    <>
      {editing ? (
        <div style={styles.nameRow}>
          <input
            aria-label="Display name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={30}
            style={styles.nameInput}
          />
          <button onClick={save} disabled={saving} style={styles.smallButton}>
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            style={styles.smallButtonMuted}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div style={styles.nameRow}>
          <h1 style={styles.name}>{displayName}</h1>
          <button
            aria-label="Edit name"
            onClick={startEditing}
            style={styles.iconButton}
          >
            ✎
          </button>
        </div>
      )}
      {error && <p style={styles.error}>{error}</p>}
    </>
  );
}

/** The showcase row (or the picker while choosing). Hidden with no badges. */
function Showcase({
  daily,
  showcased,
  onSaveShowcase,
}: {
  daily: DailyProfile | null;
  showcased: string[];
  onSaveShowcase: (ids: string[]) => Promise<string | null>;
}) {
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const earned = daily?.badges ?? [];
  const shown = showcaseBadges(showcased, earned);
  if (shown.length === 0) return null;

  if (choosing) {
    const earnedInfos = earned
      .map((b) => badgeInfo(b.id))
      .filter((info): info is BadgeInfo => info !== undefined);
    return (
      <div style={{ marginTop: '16px' }}>
        <ShowcasePicker
          earned={earnedInfos}
          selected={shown.map((s) => s.id)}
          onSave={async (ids) => {
            const failure = await onSaveShowcase(ids);
            setError(failure);
            if (!failure) setChoosing(false);
          }}
          onCancel={() => {
            setError(null);
            setChoosing(false);
          }}
        />
        {error && <p style={styles.error}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={styles.showcase} aria-label="Showcased badges" role="group">
      {shown.map((info) => (
        <StatusSegment
          key={info.id}
          kind={info.kind}
          label={info.label}
          value={info.value}
        />
      ))}
      <button style={styles.linkButton} onClick={() => setChoosing(true)}>
        showcase ✎
      </button>
    </div>
  );
}

/**
 * The profile's main card. `stats` and `daily` are null when their fetch
 * failed; the matching strip columns then show a dash.
 */
export function PlayerCard({
  profile,
  stats,
  daily,
  onSaveName,
  onSaveShowcase,
}: {
  profile: Profile;
  stats: PlayerStats | null;
  daily: DailyProfile | null;
  onSaveName: (name: string) => Promise<string | null>;
  onSaveShowcase: (ids: string[]) => Promise<string | null>;
}) {
  const memberSince = formatMemberSince(profile.createdAt);
  const hasDaily = daily !== null && daily.counters.daysRaced > 0;
  const finish = hasDaily ? bestFinish(daily.personalBests) : null;

  return (
    <div style={styles.card}>
      <div style={styles.top}>
        <div style={styles.identity}>
          <NameEditor
            displayName={profile.displayName}
            onSaveName={onSaveName}
          />
          <p style={meta}>
            {memberSince && <>Member since {memberSince}</>}
            {memberSince && profile.isPremium && ' · '}
            {profile.isPremium && <span style={styles.premium}>Premium</span>}
          </p>
        </div>
      </div>
      <Showcase
        daily={daily}
        showcased={profile.showcasedBadges}
        onSaveShowcase={onSaveShowcase}
      />
      <div style={styles.strip}>
        <StripStat
          first
          label="Days raced"
          value={hasDaily ? daily.counters.daysRaced : NO_VALUE}
        />
        <StripStat
          label="Daily wins"
          color={colors.successLight}
          value={
            hasDaily
              ? daily.counters.speedWins + daily.counters.efficiencyWins
              : NO_VALUE
          }
        />
        <StripStat
          label="Best finish"
          color="#f472b6"
          value={
            finish ? (
              <Placing rank={finish.rank} racers={finish.racers} />
            ) : (
              NO_VALUE
            )
          }
        />
        <StripStat
          label="Total runs"
          value={stats ? stats.totalRuns : NO_VALUE}
        />
      </div>
    </div>
  );
}
