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

/**
 * Renders the Lobby in the state left by a refused handshake: not connected,
 * not connecting, with the rejection message.
 */
function renderRefusedLobby(
  initialMode: 'quick' | 'private',
  onRetryConnection?: () => void
) {
  return render(
    <MemoryRouter>
      <Lobby
        isConnected={false}
        isConnecting={false}
        initialMode={initialMode}
        error="The server is full right now."
        relativeLineNumbersEnabled={false}
        onRelativeLineNumbersChange={vi.fn()}
        playerName="zaphod"
        onCreateRoom={vi.fn()}
        onJoinRoom={vi.fn()}
        onQuickMatch={vi.fn()}
        onRetryConnection={onRetryConnection}
      />
    </MemoryRouter>
  );
}

/** The lobby as a visitor with no session sees it. */
function renderVisitorLobby(
  initialMode: 'quick' | 'private' | null,
  onSignInRequired: () => void
) {
  return render(
    <MemoryRouter>
      <Lobby
        isConnected={false}
        initialMode={initialMode}
        error={null}
        relativeLineNumbersEnabled={false}
        onRelativeLineNumbersChange={vi.fn()}
        playerName=""
        onCreateRoom={vi.fn()}
        onJoinRoom={vi.fn()}
        onQuickMatch={vi.fn()}
        onSignInRequired={onSignInRequired}
        description="One sentence about racing."
      />
    </MemoryRouter>
  );
}

describe('Lobby for a visitor with no session', () => {
  it('sends Find Match to sign-in even with no player name', () => {
    const onSignInRequired = vi.fn();
    renderVisitorLobby('quick', onSignInRequired);
    const button = screen.getByText('Find Match');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onSignInRequired).toHaveBeenCalledTimes(1);
  });

  it('sends Create Room to sign-in', () => {
    const onSignInRequired = vi.fn();
    renderVisitorLobby('private', onSignInRequired);
    fireEvent.click(screen.getByText(/create/i));
    expect(onSignInRequired).toHaveBeenCalledTimes(1);
  });

  it('hides the connection status, since there is no socket', () => {
    renderVisitorLobby('quick', vi.fn());
    expect(screen.queryByText('Connected')).toBeNull();
    expect(screen.queryByText('Connecting...')).toBeNull();
  });

  it('shows the mode description', () => {
    renderVisitorLobby(null, vi.fn());
    expect(screen.getByText('One sentence about racing.')).toBeDefined();
  });
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

describe('Lobby refused connection', () => {
  it('stops claiming it is connecting once the server refuses', () => {
    renderRefusedLobby('quick');
    expect(screen.getByText('Not connected')).toBeDefined();
    expect(screen.queryByText('Connecting...')).toBeNull();
  });

  it('offers a retry, since Socket.IO will not reconnect on its own', () => {
    const onRetryConnection = vi.fn();
    renderRefusedLobby('quick', onRetryConnection);

    fireEvent.click(screen.getByText('Try again'));
    expect(onRetryConnection).toHaveBeenCalledTimes(1);
  });

  it('offers a retry from the private-match flow too', () => {
    const onRetryConnection = vi.fn();
    renderRefusedLobby('private', onRetryConnection);

    fireEvent.click(screen.getByText('Try again'));
    expect(onRetryConnection).toHaveBeenCalledTimes(1);
  });

  it('shows a room error without a retry while still connected', () => {
    // Room errors ("Room not found") arrive over a healthy socket — retrying
    // the connection would be the wrong remedy to offer.
    render(
      <MemoryRouter>
        <Lobby
          isConnected={true}
          isConnecting={false}
          initialMode="private"
          error="Room not found"
          relativeLineNumbersEnabled={false}
          onRelativeLineNumbersChange={vi.fn()}
          playerName="zaphod"
          onCreateRoom={vi.fn()}
          onJoinRoom={vi.fn()}
          onQuickMatch={vi.fn()}
          onRetryConnection={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Room not found')).toBeDefined();
    expect(screen.queryByText('Try again')).toBeNull();
  });
});
