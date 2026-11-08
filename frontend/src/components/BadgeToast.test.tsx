// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

const auth: { session: Session | null } = { session: null };
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));

const mockFetchDailyProfile = vi.fn();
const mockMarkBadgesSeen = vi.fn();
vi.mock('../api/daily', () => ({
  fetchDailyProfile: (...args: unknown[]) => mockFetchDailyProfile(...args),
  markBadgesSeen: (...args: unknown[]) => mockMarkBadgesSeen(...args),
}));

const { BadgeToast } = await import('./BadgeToast');

function profileWithUnseen(ids: string[]) {
  return {
    unseenBadges: ids.map((id) => ({ id, earnedOn: '2026-10-10' })),
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<div>PAGE</div>} />
        <Route path="/profile" element={<div>PROFILE PAGE</div>} />
      </Routes>
      <BadgeToast />
    </MemoryRouter>
  );
}

beforeEach(() => {
  auth.session = {
    access_token: 'tok',
    user: { id: 'u1' },
  } as unknown as Session;
  mockMarkBadgesSeen.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BadgeToast', () => {
  it('announces unseen badges and marks them seen', async () => {
    mockFetchDailyProfile.mockResolvedValue(
      profileWithUnseen(['days_7', 'streak_7', 'first_win', 'first_perfect'])
    );

    await act(async () => {
      renderAt('/');
    });

    expect(await screen.findByText(/earned 4 badges/)).toBeTruthy();
    expect(screen.getByText(/Regular/)).toBeTruthy();
    expect(screen.getByText('+1 more')).toBeTruthy();
    expect(mockMarkBadgesSeen).toHaveBeenCalledWith('tok', [
      'days_7',
      'streak_7',
      'first_win',
      'first_perfect',
    ]);
  });

  it('links to the profile and closes', async () => {
    mockFetchDailyProfile.mockResolvedValue(profileWithUnseen(['days_7']));

    await act(async () => {
      renderAt('/');
    });
    await act(async () => {
      (await screen.findByRole('button', { name: /See your profile/ })).click();
    });

    expect(screen.getByText('PROFILE PAGE')).toBeTruthy();
    expect(screen.queryByText(/earned 1 badge/)).toBeNull();
  });

  it('shows nothing when every badge has been seen', async () => {
    mockFetchDailyProfile.mockResolvedValue(profileWithUnseen([]));

    await act(async () => {
      renderAt('/');
    });

    expect(mockFetchDailyProfile).toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(mockMarkBadgesSeen).not.toHaveBeenCalled();
  });

  it('ignores badge ids this build does not know', async () => {
    mockFetchDailyProfile.mockResolvedValue(
      profileWithUnseen(['future_badge'])
    );

    await act(async () => {
      renderAt('/');
    });

    expect(screen.queryByRole('status')).toBeNull();
    expect(mockMarkBadgesSeen).not.toHaveBeenCalled();
  });

  it('does not check on a race page', async () => {
    await act(async () => {
      renderAt('/practice');
    });
    expect(mockFetchDailyProfile).not.toHaveBeenCalled();
  });

  it('does not check for a visitor', async () => {
    auth.session = null;
    await act(async () => {
      renderAt('/');
    });
    expect(mockFetchDailyProfile).not.toHaveBeenCalled();
  });
});
