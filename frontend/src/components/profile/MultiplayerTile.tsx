/**
 * The small "Multiplayer" tile: a green win-rate ring and the race count.
 * Hidden entirely (returns null) for players with no multiplayer races, so
 * the page can let Recent games take the full row. Win rate here is
 * quick play + private match only.
 */
import React from 'react';
import { colors } from '../../theme';
import { meta, sectionLabel, tile } from './tileStyles';

const RING_SIZE = 64;
const RING_THICKNESS = 7;

const styles: Record<string, React.CSSProperties> = {
  body: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    marginTop: '12px',
  },
  inner: {
    width: RING_SIZE - RING_THICKNESS * 2,
    height: RING_SIZE - RING_THICKNESS * 2,
    borderRadius: '50%',
    background: colors.bgCard,
    display: 'grid',
    placeItems: 'center',
    fontWeight: 800,
    fontSize: '13px',
  },
};

/**
 * Renders the multiplayer tile. `winRate` is a 0 to 1 fraction; null render
 * when `races` is 0.
 */
export function MultiplayerTile({
  races,
  winRate,
}: {
  races: number;
  winRate: number;
}) {
  if (races === 0) return null;
  const percent = Math.round(winRate * 100);

  return (
    <div style={tile}>
      <p style={sectionLabel}>Multiplayer</p>
      <div style={styles.body}>
        <div
          style={{
            width: RING_SIZE,
            height: RING_SIZE,
            borderRadius: '50%',
            background: `conic-gradient(${colors.successLight} 0 ${percent}%, #1e293b ${percent}% 100%)`,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <div style={styles.inner}>{`${percent}%`}</div>
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 800 }}>win rate</p>
          <p style={meta}>{`${races} ${races === 1 ? 'race' : 'races'}`}</p>
        </div>
      </div>
    </div>
  );
}
