/**
 * A Race of the Day badge drawn as a Vim status-line segment: a coloured
 * label block, an arrow, then the value on a dark block (`STREAK ▸ 30`).
 * Colour comes from the badge's kind (see BADGE_KIND_COLORS).
 *
 * `size="sm"` is the leaderboard chip (no arrow, tighter); `locked` draws an
 * unearned badge as a dashed outline with no colour.
 */
import React from 'react';
import { BADGE_KIND_COLORS } from '../lib/dailyBadges';
import type { BadgeKind } from '../lib/dailyBadges';
import { colors } from '../theme';

/** Dark block behind the value. */
const VALUE_BG = '#1e293b';

const SIZES = {
  lg: { height: 30, fontSize: 13, padX: 10, arrow: 10, radius: 6 },
  sm: { height: 18, fontSize: 11, padX: 5, arrow: 0, radius: 4 },
} as const;

export function StatusSegment({
  kind,
  label,
  value,
  size = 'lg',
  locked = false,
}: {
  kind: BadgeKind;
  label: string;
  value: React.ReactNode;
  size?: 'lg' | 'sm';
  locked?: boolean;
}) {
  const s = SIZES[size];
  const color = BADGE_KIND_COLORS[kind];
  const block: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: `0 ${s.padX}px`,
    whiteSpace: 'nowrap',
  };
  const dashed = `1px dashed ${colors.borderLight}`;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        flexShrink: 0,
        height: `${s.height}px`,
        fontSize: `${s.fontSize}px`,
        fontWeight: 800,
        lineHeight: 1,
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      <span
        style={{
          ...block,
          borderRadius: `${s.radius}px 0 0 ${s.radius}px`,
          ...(locked
            ? { border: dashed, borderRight: 'none', color: colors.textMuted }
            : { background: color, color: colors.bgDark }),
        }}
      >
        {label}
      </span>
      {s.arrow > 0 && !locked && (
        <span
          aria-hidden="true"
          style={{
            width: 0,
            height: 0,
            borderTop: `${s.height / 2}px solid transparent`,
            borderBottom: `${s.height / 2}px solid transparent`,
            borderLeft: `${s.arrow}px solid ${color}`,
            background: VALUE_BG,
          }}
        />
      )}
      <span
        style={{
          ...block,
          padding: `0 ${s.padX + (size === 'lg' ? 2 : 0)}px`,
          borderRadius: `0 ${s.radius}px ${s.radius}px 0`,
          ...(locked
            ? { border: dashed, color: colors.textSecondary }
            : { background: VALUE_BG, color }),
        }}
      >
        {value}
      </span>
    </span>
  );
}
