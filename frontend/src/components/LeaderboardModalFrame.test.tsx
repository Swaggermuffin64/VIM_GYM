// @vitest-environment jsdom
/**
 * Tests for the shared full-leaderboard dialog frame: it shows its title and
 * content, and every way of dismissing it reports back through onClose.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { LeaderboardModalFrame } from './LeaderboardModalFrame';

afterEach(cleanup);

function renderFrame(onClose = vi.fn()) {
  render(
    <LeaderboardModalFrame
      title="Leaderboard"
      titleDetail="16 racers"
      onClose={onClose}
    >
      <p>the rows</p>
    </LeaderboardModalFrame>
  );
  return onClose;
}

describe('LeaderboardModalFrame', () => {
  it('renders a dialog with its title, title detail, and content', () => {
    renderFrame();

    const dialog = screen.getByRole('dialog', { name: 'Leaderboard' });
    expect(dialog.textContent).toContain('16 racers');
    expect(dialog.textContent).toContain('the rows');
  });

  it('closes from the close button', () => {
    const onClose = renderFrame();

    screen.getByRole('button', { name: 'Close' }).click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = renderFrame();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = renderFrame();

    fireEvent.click(screen.getByRole('dialog').parentElement!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when the click lands inside the dialog', () => {
    const onClose = renderFrame();

    fireEvent.click(screen.getByText('the rows'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
