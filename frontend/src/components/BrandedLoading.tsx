import React from 'react';

/**
 * Full-screen branded placeholder shown while auth resolves or a lazy route
 * chunk downloads. Extracted from AuthGuard so the route components and
 * Suspense fallbacks show the identical screen instead of a black flash.
 */
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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

export function BrandedLoading() {
  return (
    <div style={styles.container} role="status" aria-live="polite">
      <span style={styles.wordmark}>VIM_GYM</span>
    </div>
  );
}
