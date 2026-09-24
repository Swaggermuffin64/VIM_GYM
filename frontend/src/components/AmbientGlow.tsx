import React from 'react';

import { colors } from '../theme';

/**
 * The two blurred, slow-drifting colour orbs behind every VIM_GYM page — the
 * cyan and pink glow that gives the site its look. Absolutely positioned, so
 * the parent must be `position: relative; overflow: hidden`, and foreground
 * content needs `position: relative; z-index: 1` to sit on top.
 *
 * The float / pulse-glow keyframes live in App.css. Pure inline styles with
 * no browser APIs, so the public pages can prerender it in Node.
 */
const orb: React.CSSProperties = {
  position: 'absolute',
  width: '500px',
  height: '500px',
  filter: 'blur(80px)',
  pointerEvents: 'none',
};

const styles: Record<string, React.CSSProperties> = {
  primary: {
    ...orb,
    top: '10%',
    left: '10%',
    background: `radial-gradient(circle, ${colors.primaryGlow} 0%, transparent 70%)`,
    animation:
      'float 15s ease-in-out infinite, pulse-glow 4s ease-in-out infinite',
  },
  secondary: {
    ...orb,
    bottom: '10%',
    right: '10%',
    background: `radial-gradient(circle, ${colors.secondaryGlow} 0%, transparent 70%)`,
    animation:
      'float 18s ease-in-out infinite reverse, pulse-glow 5s ease-in-out infinite 1s',
  },
};

export function AmbientGlow() {
  return (
    <>
      <div
        style={styles.primary}
        aria-hidden="true"
        data-testid="glow-primary"
      />
      <div
        style={styles.secondary}
        aria-hidden="true"
        data-testid="glow-secondary"
      />
    </>
  );
}
