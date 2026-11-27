/**
 * A Race of the Day badge drawn as a Vim status-line segment: a coloured
 * label block, an arrow, then the value on a dark block (`STREAK ▸ 30`).
 * Colour comes from the badge's kind (see BADGE_KIND_COLORS).
 *
 * `size="sm"` is the leaderboard chip (no arrow, tighter); `size="xl"` is
 * the large plaque segment on the profile page; `locked` draws an
 * unearned badge as a dashed outline with no colour.
 *
 * The 'flawless' kind (the perfect-run badge) stands out wherever it is
 * drawn: a holographic gradient label, gradient value text, a soft violet
 * glow, and a sheen that sweeps across it (`flawless-sheen` in App.css).
 */
import React from 'react';
import { BADGE_KIND_COLORS, FLAWLESS_GRADIENT } from '../lib/dailyBadges';
import type { BadgeKind } from '../lib/dailyBadges';
import { colors } from '../theme';

/** Dark block behind the value. */
const VALUE_BG = '#1e293b';

/** The Flawless value ("100%") in the same foil as its label. */
const flawlessText: React.CSSProperties = {
  background: FLAWLESS_GRADIENT,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};

/**
 * A bright diagonal band laid over the whole Flawless segment; App.css
 * sweeps it across every few seconds.
 */
const sheen: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  width: '40%',
  background:
    'linear-gradient(100deg, transparent 0%, rgba(255, 255, 255, 0.55) 50%, transparent 100%)',
  pointerEvents: 'none',
  transform: 'translateX(-150%)',
};

const SIZES = {
  lg: { height: 30, fontSize: 13, padX: 10, arrow: 10, radius: 6 },
  xl: { height: 44, fontSize: 17, padX: 14, arrow: 14, radius: 8 },
  sm: { height: 16, fontSize: 10, padX: 4, arrow: 0, radius: 3 },
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
  size?: 'xl' | 'lg' | 'sm';
  locked?: boolean;
}) {
  const s = SIZES[size];
  const color = BADGE_KIND_COLORS[kind];
  const flawless = kind === 'flawless' && !locked;
  // The arrow is a CSS triangle, so it takes the gradient's last colour to
  // run on from the label's right edge.
  const arrowColor = flawless ? colors.secondaryLight : color;
  const block: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: `0 ${s.padX}px`,
    whiteSpace: 'nowrap',
  };
  const dashed = `1px dashed ${colors.borderLight}`;

  return (
    <span
      data-flawless={flawless || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        flexShrink: 0,
        height: `${s.height}px`,
        fontSize: `${s.fontSize}px`,
        fontWeight: 800,
        lineHeight: 1,
        fontFamily: '"JetBrains Mono", monospace',
        ...(flawless
          ? {
              position: 'relative',
              overflow: 'hidden',
              borderRadius: `${s.radius}px`,
              boxShadow: `0 0 ${s.height / 2}px ${color}73`,
            }
          : {}),
      }}
    >
      <span
        style={{
          ...block,
          borderRadius: `${s.radius}px 0 0 ${s.radius}px`,
          ...(locked
            ? { border: dashed, borderRight: 'none', color: colors.textMuted }
            : {
                background: flawless ? FLAWLESS_GRADIENT : color,
                color: colors.bgDark,
              }),
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
            borderLeft: `${s.arrow}px solid ${arrowColor}`,
            background: VALUE_BG,
          }}
        />
      )}
      <span
        style={{
          ...block,
          padding: `0 ${s.padX + (size === 'sm' ? 0 : 2)}px`,
          borderRadius: `0 ${s.radius}px ${s.radius}px 0`,
          ...(locked
            ? { border: dashed, color: colors.textSecondary }
            : { background: VALUE_BG, color }),
        }}
      >
        {flawless ? <span style={flawlessText}>{value}</span> : value}
      </span>
      {flawless && (
        <span aria-hidden="true" className="flawless-sheen" style={sheen} />
      )}
    </span>
  );
}
