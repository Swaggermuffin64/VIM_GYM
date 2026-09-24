// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const authState = { session: null, profile: null, loading: false };
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));

const { SignedOutLobby } = await import('./multiplayer');

afterEach(cleanup);

function renderVisitorLobby(mode: 'quick' | 'private') {
  return render(
    <MemoryRouter initialEntries={[`/multiplayer?mode=${mode}`]}>
      <Routes>
        <Route path="/multiplayer" element={<SignedOutLobby />} />
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SignedOutLobby', () => {
  it.each(['quick', 'private'] as const)(
    'lets a visitor toggle relative line numbers in %s mode',
    (mode) => {
      renderVisitorLobby(mode);
      const toggle = screen.getByLabelText('Toggle relative line numbers');
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
    }
  );

  it('sends Find Match to the login page', async () => {
    renderVisitorLobby('quick');
    fireEvent.click(screen.getByText('Find Match'));
    expect(await screen.findByText('LOGIN PAGE')).toBeDefined();
  });
});
