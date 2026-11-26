// @vitest-environment jsdom
/**
 * Tests for ShowcasePicker: the three-badge cap and the in-flight save guard.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BADGE_CATALOG } from '../../lib/dailyBadges';
import { ShowcasePicker } from './ShowcasePicker';

afterEach(cleanup);

const FOUR_EARNED = BADGE_CATALOG.slice(0, 4);
const [A, B, C, D] = FOUR_EARNED;

function renderPicker(onSave = vi.fn(async () => {}), selected: string[] = []) {
  render(
    <ShowcasePicker
      earned={FOUR_EARNED}
      selected={selected}
      onSave={onSave}
      onCancel={() => {}}
    />
  );
  return onSave;
}

const badge = (name: string) => screen.getByRole('button', { name });

describe('ShowcasePicker cap', () => {
  it('disables the 4th badge at three selected and re-enables it after a deselect', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(badge(A!.name));
    await user.click(badge(B!.name));
    await user.click(badge(C!.name));

    const fourth = badge(D!.name) as HTMLButtonElement;
    expect(fourth.disabled).toBe(true);
    expect(fourth.getAttribute('aria-pressed')).toBe('false');
    expect(badge(A!.name).getAttribute('aria-pressed')).toBe('true');

    await user.click(badge(C!.name));
    expect((badge(D!.name) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('ShowcasePicker save', () => {
  it('saves the chosen ids in selection order', async () => {
    const user = userEvent.setup();
    const onSave = renderPicker(undefined, [A!.id]);
    await user.click(badge(B!.name));
    await user.click(screen.getByRole('button', { name: /save showcase/i }));
    expect(onSave).toHaveBeenCalledWith([A!.id, B!.id]);
  });

  it('ignores a second click while the save is in flight', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const onSave = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve))
    );
    renderPicker(onSave, [A!.id]);
    const save = screen.getByRole('button', {
      name: /save showcase/i,
    }) as HTMLButtonElement;
    await user.click(save);
    await user.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(save.disabled).toBe(true);

    finish();
    await vi.waitFor(() => expect(save.disabled).toBe(false));
  });
});
