import React, { useEffect } from 'react';
import { colors } from '../theme';

const mono: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace' };

/** Card widths: 'wide' fits a many-column table, 'narrow' a rank/name/time list. */
const CARD_WIDTHS: Record<'wide' | 'narrow', React.CSSProperties> = {
  wide: { width: '90vw', minWidth: '700px', maxWidth: '900px' },
  narrow: { width: '90vw', maxWidth: '520px' },
};

/**
 * The dialog every "full leaderboard" view opens in: a dimmed backdrop, a
 * titled card with a close button, an optional fixed strip of controls, and
 * a scrolling body for the rows. Closes on the button, Escape, or a backdrop
 * click.
 *
 * It owns no data. The home page's LeaderboardTable fills it with the
 * all-modes table and its time-range filter; the Race of the Day page fills
 * it with the day's whole field.
 */
export function LeaderboardModalFrame({
  title,
  titleDetail,
  controls,
  width = 'wide',
  onClose,
  children,
}: {
  title: string;
  /** Muted text beside the title, e.g. a racer count. */
  titleDetail?: string;
  /** Filters or notes pinned above the scrolling rows. */
  controls?: React.ReactNode;
  width?: 'wide' | 'narrow';
  onClose: () => void;
  children: React.ReactNode;
}) {
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
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          ...CARD_WIDTHS[width],
          background: colors.bgDark,
          border: `1px solid ${colors.border}`,
          borderRadius: '16px',
          padding: '28px 32px',
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
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
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
              {title}
            </h2>
            {titleDetail && (
              <span
                style={{ ...mono, fontSize: '14px', color: colors.textMuted }}
              >
                {titleDetail}
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
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

        {controls && <div style={{ marginBottom: '16px' }}>{controls}</div>}

        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}
