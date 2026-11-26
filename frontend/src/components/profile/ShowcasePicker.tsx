/**
 * Picker for choosing which earned badges appear in the player card's
 * showcase row. Each earned badge is a toggle button; up to three can be
 * selected, and once three are chosen the unselected ones are disabled.
 *
 * Presentational: it holds the in-progress selection, and hands the final
 * ids to `onSave` (the page posts them) or calls `onCancel`.
 */
import React, { useState } from 'react';
import { StatusSegment } from '../StatusSegment';
import type { BadgeInfo } from '../../lib/dailyBadges';
import { colors } from '../../theme';

const MAX_SHOWCASED = 3;

const styles: Record<string, React.CSSProperties> = {
  options: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  actions: { display: 'flex', gap: '8px', marginTop: '12px' },
  hint: { margin: '0 0 10px', fontSize: '13px', color: colors.textSecondary },
  save: {
    fontSize: '15px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    background: colors.primary,
    color: '#000',
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  cancel: {
    fontSize: '15px',
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    background: 'transparent',
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    fontFamily: 'inherit',
  },
};

/**
 * Lets the player pick up to three of their `earned` badges. `selected` is
 * the starting selection (badge ids, in display order).
 */
export function ShowcasePicker({
  earned,
  selected,
  onSave,
  onCancel,
}: {
  earned: BadgeInfo[];
  selected: string[];
  onSave: (ids: string[]) => void;
  onCancel: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(selected);
  const full = chosen.length >= MAX_SHOWCASED;

  const toggle = (id: string) =>
    setChosen((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <div>
      <p style={styles.hint}>Pick up to {MAX_SHOWCASED} badges to show off.</p>
      <div style={styles.options}>
        {earned.map((info) => {
          const isChosen = chosen.includes(info.id);
          return (
            <button
              key={info.id}
              type="button"
              aria-pressed={isChosen}
              aria-label={info.name}
              disabled={full && !isChosen}
              onClick={() => toggle(info.id)}
              style={{
                background: 'transparent',
                padding: '6px',
                borderRadius: '8px',
                cursor: full && !isChosen ? 'not-allowed' : 'pointer',
                opacity: full && !isChosen ? 0.4 : 1,
                border: `1px solid ${isChosen ? colors.primary : colors.border}`,
              }}
            >
              <StatusSegment
                kind={info.kind}
                label={info.label}
                value={info.value}
              />
            </button>
          );
        })}
      </div>
      <div style={styles.actions}>
        <button
          type="button"
          style={styles.save}
          onClick={() => onSave(chosen)}
        >
          Save showcase
        </button>
        <button type="button" style={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
