import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../theme';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

type LeaderboardEntry = {
  id: string;
  play_mode: string;
  duration_ms: number;
  display_name: string | null;
  achieved_at: string;
  has_tasks: boolean;
};

type PlayModeFilter = 'all' | 'practice' | 'quick_play' | 'private_match';

type TimeRange = 'all_time' | 'today' | 'month';

const TIME_RANGE_OPTIONS: readonly (readonly [TimeRange, string])[] = [
  ['today', 'Today'],
  ['month', 'This Month'],
  ['all_time', 'All Time'],
];

const mono: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace' };

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${seconds}.${tenths}s`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function playModeLabel(mode: string): string {
  switch (mode) {
    case 'practice':
      return 'Practice';
    case 'quick_play':
      return 'Quick play';
    case 'private_match':
      return 'Private';
    default:
      return mode;
  }
}

function useLeaderboardData(
  limit: number,
  filter: PlayModeFilter,
  timeRange: TimeRange = 'all_time'
) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [databaseConfigured, setDatabaseConfigured] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        limit: String(limit),
        play_mode: filter,
        time_range: timeRange,
      });
      const res = await fetch(`${API_BASE}/api/leaderboard?${q}`);
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        entries?: LeaderboardEntry[];
        databaseConfigured?: boolean;
      };
      if (!res.ok || !data.success) {
        setError(data.error || `Failed to load (${res.status})`);
        setEntries([]);
        return;
      }
      setEntries(data.entries ?? []);
      setDatabaseConfigured(data.databaseConfigured !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [limit, filter, timeRange]);

  useEffect(() => {
    void load();
  }, [load]);

  return { entries, loading, error, databaseConfigured };
}

function useReplay() {
  const navigate = useNavigate();
  const [loadingReplay, setLoadingReplay] = useState<string | null>(null);

  const handleReplay = useCallback(
    async (id: string) => {
      setLoadingReplay(id);
      try {
        const res = await fetch(`${API_BASE}/api/leaderboard/${id}/tasks`);
        const data = (await res.json()) as {
          success?: boolean;
          tasks?: unknown[];
        };
        if (!res.ok || !data.success || !Array.isArray(data.tasks)) {
          console.error('[leaderboard] failed to fetch tasks for replay');
          return;
        }
        navigate('/practice', { state: { tasks: data.tasks } });
      } catch (err) {
        console.error('[leaderboard] replay fetch error:', err);
      } finally {
        setLoadingReplay(null);
      }
    },
    [navigate]
  );

  return { loadingReplay, handleReplay };
}

function ToggleRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}
    >
      {options.map(([v, label]) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            style={{
              ...mono,
              fontSize: '13px',
              padding: '6px 14px',
              borderRadius: '6px',
              border: `1px solid ${active ? colors.primary : colors.border}`,
              background: active ? `${colors.primary}20` : 'transparent',
              color: active ? colors.textPrimary : colors.textMuted,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontWeight: active ? 600 : 400,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function EntryTable({
  rows,
  showMode,
  showDate = false,
  loadingReplay,
  onReplay,
  fontSize = '15px',
}: {
  rows: (LeaderboardEntry | null)[];
  showMode: boolean;
  showDate?: boolean;
  loadingReplay: string | null;
  onReplay: (id: string) => void;
  fontSize?: string;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          ...mono,
          width: '100%',
          minWidth: '360px',
          borderCollapse: 'collapse',
          fontSize,
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: `1px solid ${colors.border}`,
              textAlign: 'left',
            }}
          >
            <th
              style={{
                padding: '10px 8px',
                color: colors.textMuted,
                fontWeight: 600,
              }}
            >
              #
            </th>
            <th
              style={{
                padding: '10px 8px',
                color: colors.textMuted,
                fontWeight: 600,
              }}
            >
              Time
            </th>
            <th
              style={{
                padding: '10px 8px',
                color: colors.textMuted,
                fontWeight: 600,
              }}
            >
              Name
            </th>
            {showMode && (
              <th
                style={{
                  padding: '10px 8px',
                  color: colors.textMuted,
                  fontWeight: 600,
                }}
              >
                Mode
              </th>
            )}
            {showDate && (
              <th
                style={{
                  padding: '10px 8px',
                  color: colors.textMuted,
                  fontWeight: 600,
                }}
              >
                Date
              </th>
            )}
            <th
              style={{
                padding: '10px 8px',
                color: colors.textMuted,
                fontWeight: 600,
              }}
            >
              Compete
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row?.id ?? `empty-${i}`}
              style={{
                borderBottom:
                  i < rows.length - 1 ? `1px solid ${colors.border}` : 'none',
                color: colors.textPrimary,
              }}
            >
              <td style={{ padding: '10px 8px', color: colors.textSecondary }}>
                {i + 1}
              </td>
              <td
                style={{
                  padding: '10px 8px',
                  fontWeight: 600,
                  color: row ? colors.successLight : colors.textMuted,
                }}
              >
                {row ? formatDuration(row.duration_ms) : '—'}
              </td>
              <td
                style={{
                  padding: '10px 8px',
                  color: row ? colors.textPrimary : colors.textMuted,
                }}
              >
                {row?.display_name?.trim() || '—'}
              </td>
              {showMode && (
                <td
                  style={{ padding: '10px 8px', color: colors.textSecondary }}
                >
                  {row ? playModeLabel(row.play_mode) : '—'}
                </td>
              )}
              {showDate && (
                <td
                  style={{
                    padding: '10px 8px',
                    color: colors.textMuted,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row ? formatDate(row.achieved_at) : '—'}
                </td>
              )}
              <td style={{ padding: '10px 8px' }}>
                {row?.has_tasks && (
                  <button
                    type="button"
                    onClick={() => onReplay(row.id)}
                    disabled={loadingReplay === row.id}
                    title="Practice these tasks"
                    style={{
                      ...mono,
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: `1px solid ${colors.border}`,
                      background: 'transparent',
                      color: colors.textSecondary,
                      cursor: loadingReplay === row.id ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'color 0.15s ease, border-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = colors.textPrimary;
                      e.currentTarget.style.borderColor = colors.primary;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = colors.textSecondary;
                      e.currentTarget.style.borderColor = colors.border;
                    }}
                  >
                    {loadingReplay === row.id ? '…' : '▶ Play Same Tasks'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusMessage({
  loading,
  error,
  databaseConfigured,
}: {
  loading: boolean;
  error: string | null;
  databaseConfigured: boolean;
}) {
  if (loading)
    return <p style={{ ...mono, color: colors.textSecondary }}>Loading…</p>;
  if (error) return <p style={{ ...mono, color: '#f87171' }}>{error}</p>;
  if (!databaseConfigured)
    return (
      <p style={{ ...mono, color: colors.textSecondary }}>
        Leaderboard not available (database not configured).
      </p>
    );
  return null;
}

/* ------------------------------------------------------------------ */
/*  Full leaderboard modal                                            */
/* ------------------------------------------------------------------ */

function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const [timeRange, setTimeRange] = useState<TimeRange>('all_time');
  const { entries, loading, error, databaseConfigured } = useLeaderboardData(
    30,
    'all',
    timeRange
  );
  const { loadingReplay, handleReplay } = useReplay();

  const MIN_MODAL_ROWS = 10;
  const modalRows: (LeaderboardEntry | null)[] = [...entries];
  while (modalRows.length < MIN_MODAL_ROWS) modalRows.push(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: colors.bgDark,
          border: `1px solid ${colors.border}`,
          borderRadius: '16px',
          padding: '28px 32px',
          width: '90vw',
          minWidth: '700px',
          maxWidth: '900px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              ...mono,
              margin: 0,
              fontSize: '20px',
              fontWeight: 700,
              color: colors.textPrimary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Leaderboard
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...mono,
              background: 'none',
              border: 'none',
              color: colors.textMuted,
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <ToggleRow
            options={TIME_RANGE_OPTIONS}
            value={timeRange}
            onChange={setTimeRange}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && (
            <StatusMessage
              loading={false}
              error={error}
              databaseConfigured={databaseConfigured}
            />
          )}
          {!error && !databaseConfigured && (
            <StatusMessage
              loading={false}
              error={null}
              databaseConfigured={false}
            />
          )}
          {!error && databaseConfigured && (
            <div
              style={{
                opacity: loading ? 0.5 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              <EntryTable
                rows={modalRows}
                showMode
                showDate
                loadingReplay={loadingReplay}
                onReplay={(id) => void handleReplay(id)}
                fontSize="14px"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline leaderboard (home page)                                    */
/* ------------------------------------------------------------------ */

export function LeaderboardTable({ style }: { style?: React.CSSProperties }) {
  const [open, setOpen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const { entries, loading, error, databaseConfigured } = useLeaderboardData(
    5,
    'all'
  );
  const { loadingReplay, handleReplay } = useReplay();

  const MIN_ROWS = 5;
  const rows: (LeaderboardEntry | null)[] = [...entries];
  while (rows.length < MIN_ROWS) rows.push(null);

  return (
    <>
      <div
        style={{ ...style, cursor: open ? undefined : 'pointer' }}
        onClick={open ? undefined : () => setOpen(true)}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            ...mono,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            background: 'none',
            border: 'none',
            padding: 0,
            marginBottom: open ? '16px' : 0,
            cursor: 'pointer',
          }}
        >
          <h2
            style={{
              ...mono,
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              color: colors.textPrimary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Leaderboard
          </h2>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              fontSize: '18px',
              color: colors.textMuted,
              transition: 'transform 0.2s ease, background 0.2s ease',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              background: `${colors.border}33`,
            }}
          >
            ▼
          </span>
        </button>

        {open && (
          <>
            <StatusMessage
              loading={loading}
              error={error}
              databaseConfigured={databaseConfigured}
            />
            {!loading && !error && databaseConfigured && (
              <EntryTable
                rows={rows}
                showMode
                loadingReplay={loadingReplay}
                onReplay={(id) => void handleReplay(id)}
              />
            )}
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              style={{
                ...mono,
                fontSize: '15px',
                padding: '4px 0',
                border: 'none',
                background: 'transparent',
                color: colors.textMuted,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s ease',
                marginTop: '12px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = colors.textPrimary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = colors.textMuted;
              }}
            >
              View More
            </button>
          </>
        )}
      </div>

      {modalOpen && <LeaderboardModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
