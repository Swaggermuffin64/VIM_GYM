import React from 'react';

import { colors } from '../theme';
import type { ChallengeInfo } from '../api/daily';

/**
 * The "X thinks they're better than you" banner for someone who arrived via
 * a daily share link. Shown on /daily (where share links land) and again on
 * /login (where the Start button sends a visitor), so the hook survives the
 * whole journey to the race.
 */
const styles: Record<string, React.CSSProperties> = {
  banner: {
    width: '100%',
    maxWidth: '860px',
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '20px 28px',
    marginBottom: '16px',
    background: colors.bgDark,
    position: 'relative',
    zIndex: 1,
    textAlign: 'center',
    fontFamily: '"JetBrains Mono", monospace',
  },
  headline: {
    fontSize: '20px',
    color: colors.textPrimary,
    margin: '0 0 6px',
    lineHeight: 1.5,
  },
  detail: {
    fontSize: '15px',
    color: colors.textSecondary,
    margin: 0,
    lineHeight: 1.5,
  },
};

/** Format a race duration as seconds with one decimal, e.g. 15702 -> "15.7". */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export function ChallengeTaunt({
  challenge,
  callToAction,
}: {
  challenge: ChallengeInfo;
  /** The closing line, e.g. "Sign in and put them in their place." */
  callToAction: string;
}) {
  return (
    <div style={styles.banner} role="status">
      <p style={styles.headline}>
        <strong>{challenge.displayName}</strong> thinks they&#39;re better than
        you <em>(at vim)</em>.
      </p>
      <p style={styles.detail}>
        They finished today&#39;s daily race in{' '}
        {formatSeconds(challenge.bestMs)} seconds. {callToAction}
      </p>
    </div>
  );
}
