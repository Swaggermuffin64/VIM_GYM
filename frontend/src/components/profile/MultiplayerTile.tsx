/**
 * The "Multiplayer" tile: a green win-rate ring with the win and race counts.
 * Hidden entirely (returns null) for players with no multiplayer races, so
 * the page can let Recent games take the full row. Win rate here is
 * quick play + private match only.
 */
import React from 'react';
import { colors } from '../../theme';
import { meta, sectionLabel, tile } from './tileStyles';

const RING_SIZE = 116;
const RING_THICKNESS = 10;

const styles: Record<string, React.CSSProperties> = {
  root: { ...tile, display: 'flex', flexDirection: 'column' },
  /** Centres the ring in whatever height the grid row gives the tile. */
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '12px',
    textAlign: 'center',
  },
  inner: {
    width: RING_SIZE - RING_THICKNESS * 2,
    height: RING_SIZE - RING_THICKNESS * 2,
    borderRadius: '50%',
    background: colors.bgCard,
    display: 'grid',
    placeItems: 'center',
    fontWeight: 800,
    fontSize: '24px',
  },
};

/**
 * Renders the multiplayer tile: a large win-rate ring centred in the tile
 * (which stretches to its grid row) with "N wins · M races" beneath.
 * `winRate` is a 0 to 1 fraction; renders nothing when `races` is 0.
 */
export function MultiplayerTile({
  races,
  wins,
  winRate,
}: {
  races: number;
  wins: number;
  winRate: number;
}) {
  if (races === 0) return null;
  const percent = Math.round(winRate * 100);

  return (
    <div style={styles.root}>
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
          <p style={meta}>
            {`${wins} ${wins === 1 ? 'win' : 'wins'} · ${races} ${races === 1 ? 'race' : 'races'}`}
          </p>
        </div>
      </div>
    </div>
  );
}
