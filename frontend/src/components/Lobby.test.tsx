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
        isConnected={true}
        initialMode={initialMode}
        error={null}
        relativeLineNumbersEnabled={false}
        onRelativeLineNumbersChange={vi.fn()}
        playerName=""
        onCreateRoom={vi.fn()}
        onJoinRoom={vi.fn()}
        onQuickMatch={vi.fn()}
        onSignInRequired={onSignInRequired}
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

  it('keeps the connection status light', () => {
    renderVisitorLobby('quick', vi.fn());
    expect(screen.getByText('Connected')).toBeDefined();
  });
});

/** A member's private-match lobby with spies on the room callbacks. */
function renderPrivateLobby() {
  const onCreateRoom = vi.fn();
  const onJoinRoom = vi.fn();
  render(
    <MemoryRouter>
      <Lobby
        isConnected={true}
        initialMode="private"
        error={null}
        relativeLineNumbersEnabled={false}
        onRelativeLineNumbersChange={vi.fn()}
        playerName="zaphod"
        onCreateRoom={onCreateRoom}
        onJoinRoom={onJoinRoom}
        onQuickMatch={vi.fn()}
      />
    </MemoryRouter>
  );
  return { onCreateRoom, onJoinRoom };
}

describe('Lobby private match', () => {
  it('creates a room from the primary button', () => {
    const { onCreateRoom } = renderPrivateLobby();
    fireEvent.click(screen.getByText('Create a room'));
    expect(onCreateRoom).toHaveBeenCalledWith('zaphod');
  });

  it('shows the room code field up front, with Join disabled until a code is typed', () => {
    renderPrivateLobby();
    const join = screen.getByText('Join') as HTMLButtonElement;
    expect(join.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Room code'), {
      target: { value: 'ABC123' },
    });
    expect(join.disabled).toBe(false);
  });

  it('joins with a valid code', () => {
    const { onJoinRoom } = renderPrivateLobby();
    fireEvent.change(screen.getByLabelText('Room code'), {
      target: { value: 'ABC123' },
    });
    fireEvent.click(screen.getByText('Join'));
    expect(onJoinRoom).toHaveBeenCalledWith('ABC123', 'zaphod');
  });

  it('joins on Enter in the code field', () => {
    const { onJoinRoom } = renderPrivateLobby();
    const field = screen.getByLabelText('Room code');
    fireEvent.change(field, { target: { value: 'ABC123' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onJoinRoom).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed code without calling join', () => {
    const { onJoinRoom } = renderPrivateLobby();
    fireEvent.change(screen.getByLabelText('Room code'), {
      target: { value: 'AB' },
    });
    fireEvent.click(screen.getByText('Join'));
    expect(onJoinRoom).not.toHaveBeenCalled();
    expect(screen.getByText(/Room code must be/)).toBeDefined();
  });

  it('sends a visitor pressing Join to sign-in, even with no code', () => {
    const onSignInRequired = vi.fn();
    renderVisitorLobby('private', onSignInRequired);
    const join = screen.getByText('Join') as HTMLButtonElement;
    expect(join.disabled).toBe(false);
    fireEvent.click(join);
    expect(onSignInRequired).toHaveBeenCalledTimes(1);
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
