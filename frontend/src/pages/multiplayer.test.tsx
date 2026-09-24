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
    'hides the relative line numbers toggle in %s mode',
    (mode) => {
      renderVisitorLobby(mode);
      expect(
        screen.queryByLabelText('Toggle relative line numbers')
      ).toBeNull();
      expect(screen.queryByText(/relative line numbers/i)).toBeNull();
    }
  );

  it('sends Find Match to the login page', async () => {
    renderVisitorLobby('quick');
    fireEvent.click(screen.getByText('Find Match'));
    expect(await screen.findByText('LOGIN PAGE')).toBeDefined();
  });
});
