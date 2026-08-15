// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Lobby } from './Lobby';

/**
 * Renders the Lobby inside a router so we can verify that leaving the lobby
 * is a client-side navigation (instant) rather than a full page reload
 * (which restarts the auth pipeline and causes a black screen).
 */
function renderLobby(initialMode: 'quick' | 'private') {
  return render(
    <MemoryRouter initialEntries={[`/multiplayer?mode=${initialMode}`]}>
      <Routes>
        <Route path="/" element={<div>HOME PAGE</div>} />
        <Route
          path="/multiplayer"
          element={
            <Lobby
              isConnected={true}
              initialMode={initialMode}
              error={null}
              relativeLineNumbersEnabled={false}
              onRelativeLineNumbersChange={vi.fn()}
              playerName="zaphod"
              onCreateRoom={vi.fn()}
              onJoinRoom={vi.fn()}
              onQuickMatch={vi.fn()}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Lobby back navigation', () => {
  it('returns to home via client-side routing from quick play', async () => {
    renderLobby('quick');
    fireEvent.click(screen.getByText('← Back'));
    expect(await screen.findByText('HOME PAGE')).toBeDefined();
  });

  it('returns to home via client-side routing from private match', async () => {
    renderLobby('private');
    fireEvent.click(screen.getByText('← Back'));
    expect(await screen.findByText('HOME PAGE')).toBeDefined();
  });
});
