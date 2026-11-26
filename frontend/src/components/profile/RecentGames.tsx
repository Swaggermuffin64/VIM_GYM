/**
 * The "Recent games" tile: one row per recent session in any mode, with a
 * 4px coloured left strip (green = 1st, cyan = other multiplayer finish,
 * amber = daily, red = DNF/left, slate = practice), then mode, result and
 * time. Daily rows show that day's placing as rank/racers, looked up from the
 * daily profile's recent days by UTC date. Presentational.
 */
import React from 'react';
import type { DailyHistoryDay } from '../../api/daily';
import type { RecentGame } from '../../api/profile';
import { formatDuration, formatPlacing, ordinal } from '../../lib/format';
import { colors } from '../../theme';
import { meta, sectionLabel, tile } from './tileStyles';

const RED = '#f87171';
const SLATE = colors.border;

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'grid',
    gridTemplateColumns: '4px minmax(0, 1fr) auto auto',
    gap: '12px',
    alignItems: 'center',
    padding: '7px 0',
    borderBottom: '1px solid #1e2533',
    fontSize: '15px',
  },
  strip: { alignSelf: 'stretch', minHeight: '22px', borderRadius: 2 },
  mode: { textTransform: 'capitalize' },
};

/** True for a game that did not finish (quit or timed out). */
function isUnfinished(game: RecentGame): boolean {
  return !game.finished && game.position === null;
}

/** Colour of the row's left strip, per the profile spec. */
function stripColor(game: RecentGame): string {
  if (game.playMode === 'practice') return SLATE;
  if (isUnfinished(game)) return RED;
  if (game.playMode === 'daily') return colors.warning;
  return game.position === 1 ? colors.successLight : colors.primary;
}

/**
 * Result column text: daily rows show the placing for that UTC day (blank if
 * it is not in `dailyRecent`), multiplayer shows an ordinal, practice and
 * other solo finishes show nothing, unfinished games read "left" or "DNF".
 */
function resultLabel(game: RecentGame, dailyRecent: DailyHistoryDay[]): string {
  if (game.playMode === 'daily') {
    const day = game.startedAt.slice(0, 10);
    const entry = dailyRecent.find((d) => d.raceDate === day);
    return entry ? formatPlacing(entry.speedRank, entry.racers) : '';
  }
  if (game.position !== null) return ordinal(game.position);
  if (game.finished) return '';
  return game.leftRace ? 'left' : 'DNF';
}

/**
 * Renders the recent games list. `games` are newest first; `dailyRecent` is
 * the daily profile's recent days used to fill in daily placings.
 */
export function RecentGames({
  games,
  dailyRecent,
}: {
  games: RecentGame[];
  dailyRecent: DailyHistoryDay[];
}) {
  return (
    <div style={tile}>
      <p style={{ ...sectionLabel, marginBottom: '6px' }}>Recent games</p>
      {games.map((game, i) => {
        const practice = game.playMode === 'practice';
        return (
          <div key={i} style={styles.row}>
            <span style={{ ...styles.strip, background: stripColor(game) }} />
            <span
              style={{
                ...styles.mode,
                color: practice ? colors.textMuted : colors.textPrimary,
              }}
            >
              {game.playMode.replaceAll('_', ' ')}
            </span>
            <span
              style={{
                fontWeight: game.position === 1 ? 800 : 400,
                color:
                  game.position === 1
                    ? colors.successLight
                    : isUnfinished(game)
                      ? RED
                      : colors.textPrimary,
              }}
            >
              {resultLabel(game, dailyRecent)}
            </span>
            <span style={{ ...meta, fontSize: '15px' }}>
              {game.totalTimeMs !== null
                ? formatDuration(game.totalTimeMs)
                : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
