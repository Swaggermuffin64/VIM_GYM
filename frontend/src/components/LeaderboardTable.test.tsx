// @vitest-environment jsdom
/**
 * Tests for the home page's collapsible leaderboard: whether it starts open,
 * and that a collapsed board costs nothing until the user opens it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { LeaderboardTable } from './LeaderboardTable';
import { invalidateMainLeaderboardCache } from '../api/leaderboard';

const mockFetch = vi.fn();

beforeEach(() => {
  // The API client caches leaderboard slices across renders; each test wants
  // to observe its own network traffic.
  invalidateMainLeaderboardCache();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      entries: [],
      databaseConfigured: true,
    }),
  });
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderBoard(defaultOpen?: boolean) {
  return render(
    <MemoryRouter>
      <LeaderboardTable defaultOpen={defaultOpen} />
    </MemoryRouter>
  );
}

describe('LeaderboardTable', () => {
  it('opens by default and loads its rows', async () => {
    await act(async () => {
      renderBoard();
    });

    expect(
      screen.getByRole('button', { expanded: true, name: /Leaderboard/i })
    ).toBeTruthy();
    expect(mockFetch).toHaveBeenCalled();
  });

  it('stays collapsed and skips the request when defaultOpen is false', async () => {
    await act(async () => {
      renderBoard(false);
    });

    expect(
      screen.getByRole('button', { expanded: false, name: /Leaderboard/i })
    ).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('loads on first expand', async () => {
    await act(async () => {
      renderBoard(false);
    });
    expect(mockFetch).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByRole('button', { name: /Leaderboard/i }).click();
    });

    expect(
      screen.getByRole('button', { expanded: true, name: /Leaderboard/i })
    ).toBeTruthy();
    expect(mockFetch).toHaveBeenCalled();
  });
});
