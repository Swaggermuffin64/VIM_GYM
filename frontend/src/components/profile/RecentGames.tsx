/**
 * The "Recent games" tile. Race of the Day shows one row per raced day (every
 * attempt that day folded together) with both board placings — speed in the
 * Place column, efficiency in the Eff. column — and the day's best time.
 * Every other mode is one row per game: multiplayer shows its finishing
 * position, practice just its time, unfinished games "left" or "DNF".
 * A 4px coloured strip marks the row type (amber = daily, green = 1st,
 * cyan = other multiplayer finish, red = DNF/left, slate = practice).
 * Presentational; rows are built by `recentActivity()` in lib/profileView.
 */
import React from 'react';
import type { DailyHistoryDay } from '../../api/daily';
import type { RecentGame } from '../../api/profile';
import { formatDuration, formatPlacing, ordinal } from '../../lib/format';
import { recentActivity } from '../../lib/profileView';
import type { BoardPlacing, RecentActivityRow } from '../../lib/profileView';
import { colors } from '../../theme';
import { meta, sectionLabel, tile } from './tileStyles';

const RED = '#f87171';
const SLATE = colors.border;

const styles: Record<string, React.CSSProperties> = {
  // One grid for the whole list so every column lines up down the tile.
  list: {
    display: 'grid',
    gridTemplateColumns: '4px minmax(0, 1fr) auto auto auto',
    columnGap: '16px',
    alignItems: 'center',
    fontSize: '15px',
  },
  head: {
    ...meta,
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '6px 0',
    justifySelf: 'end',
  },
  strip: { alignSelf: 'stretch', minHeight: '22px', borderRadius: 2 },
  name: { padding: '9px 0' },
  mode: { textTransform: 'capitalize' },
  date: { ...meta, marginLeft: '10px' },
  cell: { justifySelf: 'end' },
  divider: { gridColumn: '1 / -1', borderTop: '1px solid #1e2533' },
};

/** "Today", or "Nov 25" for any other UTC date key. */
function formatDay(day: string, today: string): string {
  if (day === today) return 'Today';
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** True for a game that did not finish (quit or timed out). */
function isUnfinished(game: RecentGame): boolean {
  return !game.finished && game.position === null;
}

/** Colour of a game row's left strip. */
function gameStripColor(game: RecentGame): string {
  if (game.playMode === 'practice') return SLATE;
  if (isUnfinished(game)) return RED;
  return game.position === 1 ? colors.successLight : colors.primary;
}

/** Result text for a non-daily game: ordinal, blank, "left" or "DNF". */
function gameResult(game: RecentGame): string {
  if (game.position !== null) return ordinal(game.position);
  if (game.finished) return '';
  return game.leftRace ? 'left' : 'DNF';
}

/** A daily board placing, green and bold when it is a win. */
function Placing({ placing }: { placing: BoardPlacing }) {
  const won = placing.rank === 1;
  return (
    <span
      style={{
        ...styles.cell,
        fontWeight: won ? 800 : 400,
        color: won ? colors.successLight : colors.textPrimary,
      }}
    >
      {formatPlacing(placing.rank, placing.racers)}
    </span>
  );
}

/** The five grid cells for one row, plus the divider beneath it. */
function Row({ row, today }: { row: RecentActivityRow; today: string }) {
  if (row.kind === 'daily') {
    return (
      <>
        <span style={{ ...styles.strip, background: colors.warning }} />
        <span style={styles.name}>
          Race of the Day
          <span style={styles.date}>{formatDay(row.day, today)}</span>
        </span>
        <Placing placing={row.speed} />
        {row.efficiency ? (
          <Placing placing={row.efficiency} />
        ) : (
          <span
            style={{ ...styles.cell, color: colors.textMuted }}
            aria-label="No efficiency placing"
          >
            —
          </span>
        )}
        <span style={{ ...styles.cell, ...meta, fontSize: '15px' }}>
          {formatDuration(row.bestMs)}
        </span>
        <div style={styles.divider} />
      </>
    );
  }

  const { game } = row;
  const practice = game.playMode === 'practice';
  return (
    <>
      <span style={{ ...styles.strip, background: gameStripColor(game) }} />
      <span
        style={{
          ...styles.name,
          color: practice ? colors.textMuted : colors.textPrimary,
        }}
      >
        <span style={styles.mode}>{game.playMode.replaceAll('_', ' ')}</span>
        <span style={styles.date}>
          {formatDay(game.startedAt.slice(0, 10), today)}
        </span>
      </span>
      <span
        style={{
          ...styles.cell,
          fontWeight: game.position === 1 ? 800 : 400,
          color:
            game.position === 1
              ? colors.successLight
              : isUnfinished(game)
                ? RED
                : colors.textPrimary,
        }}
      >
        {gameResult(game)}
      </span>
      <span />
      <span style={{ ...styles.cell, ...meta, fontSize: '15px' }}>
        {game.totalTimeMs !== null ? formatDuration(game.totalTimeMs) : '—'}
      </span>
      <div style={styles.divider} />
    </>
  );
}

/**
 * Renders the recent activity list. `games` are the player's recent sessions
 * in any mode (newest first); `dailyRecent` are their recent Race of the Day
 * results, which supply one row per raced day; `today` is the UTC date key
 * used to label rows "Today".
 */
export function RecentGames({
  games,
  dailyRecent,
  today,
}: {
  games: RecentGame[];
  dailyRecent: DailyHistoryDay[];
  today: string;
}) {
  const rows = recentActivity(games, dailyRecent);

  return (
    <div style={tile}>
      <p style={{ ...sectionLabel, marginBottom: '6px' }}>Recent games</p>
      {rows.length === 0 ? (
        <p style={{ ...meta, margin: '8px 0 0' }}>
          No games yet — race to fill this in.
        </p>
      ) : (
        <div style={styles.list}>
          <span />
          <span />
          <span style={styles.head}>Place</span>
          <span style={styles.head}>Eff.</span>
          <span style={styles.head}>Time</span>
          <div style={styles.divider} />
          {rows.map((row) => (
            <Row
              key={
                row.kind === 'daily'
                  ? `daily-${row.day}`
                  : `game-${row.game.startedAt}`
              }
              row={row}
              today={today}
            />
          ))}
        </div>
      )}
    </div>
  );
}
