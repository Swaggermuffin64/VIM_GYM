import React from 'react';

/**
 * Full-screen branded placeholder shown while auth resolves or a lazy route
 * chunk downloads. Extracted from AuthGuard so the route components and
 * Suspense fallbacks show the identical screen instead of a black flash.
 *
 * Renders a thin spinning ring (amber arc, keyframe `branded-loading-spin`
 * in App.css) above the VIM_GYM wordmark so the screen visibly shows
 * progress. The ring is decorative: only the container's status role is
 * announced to assistive tech.
 */
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    background: '#000000',
  },
  wordmark: {
    color: '#3f3f46',
    fontSize: '20px',
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '1px',
  },
};

/**
 * The amber spinning ring on its own, for in-page loading (a leaderboard
 * switching boards) where the full-screen BrandedLoading would be too much.
 * Decorative: the caller owns the status role and its label.
 */
export function BrandedSpinner({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        border: '3px solid #27272a',
        borderTopColor: '#fbbf24',
        animation: 'branded-loading-spin 0.9s linear infinite',
      }}
      className="branded-loading-spinner"
      data-testid="branded-loading-spinner"
      aria-hidden="true"
    />
  );
}

export function BrandedLoading() {
  return (
    <div style={styles.container} role="status" aria-live="polite">
      <BrandedSpinner />
      <span style={styles.wordmark}>VIM_GYM</span>
    </div>
  );
}
