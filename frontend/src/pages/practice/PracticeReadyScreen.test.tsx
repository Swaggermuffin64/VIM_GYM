// @vitest-environment jsdom
/**
 * The practice Ready screen is public. These tests pin the one behaviour that
 * differs for a visitor: the Ready button becomes a sign-in link.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

const AUTH: { session: Session | null } = { session: null };
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => AUTH }));

const TASKS = [
  {
    id: 1,
    type: 'navigate',
    codeSnippet: 'hello world',
    targetRange: { from: 6, to: 11 },
  },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: TASKS, gameId: null }),
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const { default: PracticeEditor } = await import('./PracticeEditor');

function renderPractice() {
  return render(
    <MemoryRouter initialEntries={['/practice']}>
      <Routes>
        <Route path="/practice" element={<PracticeEditor />} />
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('practice Ready screen for a visitor', () => {
  it('sends Ready to sign-in', async () => {
    AUTH.session = null;
    renderPractice();
    const button = await screen.findByText('Sign in to start');
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(button);
    expect(await screen.findByText('LOGIN PAGE')).toBeDefined();
  });

  it('labels the button Ready for a member', async () => {
    AUTH.session = { access_token: 'tok' } as Session;
    renderPractice();
    expect(await screen.findByText('Ready')).toBeDefined();
  });
});

describe('practice sidebar with the inline cheatsheet open', () => {
  // The inline cheatsheet is long; it must sit below the keys-pressed box so
  // the player's live keystrokes stay visible at the top of the sidebar.
  it('shows the keys-pressed box above the cheatsheet', async () => {
    AUTH.session = { access_token: 'tok' } as Session;
    renderPractice();
    fireEvent.click(
      await screen.findByLabelText('Toggle cheatsheet visibility')
    );
    const ready = await screen.findByText('Ready');
    await waitFor(() =>
      expect((ready as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(ready);

    const keysPressed = await screen.findByText('Keys Pressed (Current Task)');
    const cheatSheet = await screen.findByText('Basic Cheat Sheet');
    expect(
      keysPressed.compareDocumentPosition(cheatSheet) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
