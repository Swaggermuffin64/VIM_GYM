# Vim Racing Matchmaking Service

A lightweight WebSocket-based matchmaking server that queues players and assigns them to game rooms on the Fly.io game server.

## How It Works

```
┌─────────────┐     1. Connect & queue     ┌─────────────────────┐
│   Player A  │ ─────────────────────────► │  Matchmaking Server │
└─────────────┘                            │  (this service)     │
                                           │                     │
┌─────────────┐     2. Connect & queue     │  - Player queue     │
│   Player B  │ ─────────────────────────► │  - FIFO matching    │
└─────────────┘                            └─────────┬───────────┘
                                                     │
                                     3. Generate roomId + sign token
                                     4. Send roomId + URL + token to both
                                                     ▼
┌─────────────┐                            ┌─────────────────────┐
│   Player A  │ ◄───── 5. Connect ───────► │   Game Server       │
│   Player B  │        to game server      │   (Fly.io)          │
└─────────────┘                            └─────────────────────┘
```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set environment variables:

   ```bash
   export GAME_SERVER_URL=http://localhost:3001
   export MATCH_TOKEN_SECRET=your_shared_secret
   export PORT=3002                    # optional, default 3002
   export PLAYERS_PER_MATCH=2          # optional, default 2
   ```

3. Run in development:

   ```bash
   npm run dev
   ```

4. Build and run for production:
   ```bash
   npm run build
   npm start
   ```

## WebSocket Protocol

### Client → Server Messages

```typescript
// Join the matchmaking queue
{ type: 'queue:join', playerName: string }

// Leave the queue
{ type: 'queue:leave' }

// Keep-alive ping
{ type: 'ping' }
```

### Server → Client Messages

```typescript
// Confirmed queue join
{ type: 'queue:joined', position: number, playerId: string }

// Queue position update (when others join/leave)
{ type: 'queue:position', position: number }

// Confirmed queue leave
{ type: 'queue:left' }

// Match found! Connect to the game server
{
  type: 'match:found',
  roomId: string,
  connectionUrl: string,
  players: Array<{ id: string, name: string }>,
  token?: string  // signed JWT for game server auth
}

// Error occurred
{ type: 'error', message: string }

// Pong response
{ type: 'pong' }
```

## Frontend Integration Example

```typescript
const MATCHMAKING_URL = 'wss://your-matchmaking-server.com';

function quickMatch(playerName: string) {
  const ws = new WebSocket(MATCHMAKING_URL);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'queue:join', playerName }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case 'queue:joined':
        console.log(`Queued at position ${msg.position}`);
        break;

      case 'queue:position':
        console.log(`Queue position: ${msg.position}`);
        break;

      case 'match:found':
        console.log(`Match found! Room: ${msg.roomId}`);
        ws.close();
        connectToGameServer(
          msg.connectionUrl,
          msg.roomId,
          playerName,
          msg.token
        );
        break;

      case 'error':
        console.error(msg.message);
        break;
    }
  };
}
```

## Deployment

### Fly.io

Deployed automatically via GitHub Actions on push to `main`. See `.github/workflows/matchmaking-deploy.yml`.

### Docker

```bash
npm run build
docker build -t vim-racing-matchmaking .
docker run -p 3002:3002 \
  -e GAME_SERVER_URL=https://your-game-server.fly.dev \
  -e MATCH_TOKEN_SECRET=your_secret \
  vim-racing-matchmaking
```

## Load Testing

A load test script is included to simulate multiple players joining the matchmaking queue.

### Run Against Local Server

```bash
# Start the matchmaking server first
npm run dev

# In another terminal, run the load test
npm run load-test:local
```

### Run Against Live Server

```bash
# Set your production URL and run
MATCHMAKING_URL=wss://your-matchmaker.example.com npm run load-test:live
```

### Configuration Options

| Environment Variable | Default               | Description                            |
| -------------------- | --------------------- | -------------------------------------- |
| `MATCHMAKING_URL`    | `ws://localhost:3002` | WebSocket URL of matchmaking server    |
| `NUM_PLAYERS`        | `10`                  | Number of simulated players            |
| `STAGGER_MS`         | `500`                 | Delay between each player joining (ms) |
| `TIMEOUT_MS`         | `60000`               | Max time to wait for a match (ms)      |

### Examples

```bash
# 20 players with 200ms between joins
NUM_PLAYERS=20 STAGGER_MS=200 npm run load-test:local

# Stress test: 50 players, rapid fire
NUM_PLAYERS=50 STAGGER_MS=100 MATCHMAKING_URL=wss://your-matchmaker.example.com npm run load-test

# Quick sanity check: 4 players
NUM_PLAYERS=4 STAGGER_MS=1000 npm run load-test:local
```

### Expected Output

```
🚀 Starting Matchmaking Load Test
   Target: ws://localhost:3002
   Players: 10
   Stagger: 500ms between players

[LoadTest_1_...] 🔌 Connected
[LoadTest_1_...] 📋 Queued (playerId: abc123)
[LoadTest_2_...] 🔌 Connected
[LoadTest_2_...] 📋 Queued (playerId: def456)
[LoadTest_1_...] ✅ Matched! Room: room-xyz (1523ms)
[LoadTest_2_...] ✅ Matched! Room: room-xyz (1489ms)
...

==================================================
📊 LOAD TEST RESULTS
==================================================
   Target: ws://localhost:3002
   Players: 10
   Duration: 35.2s
--------------------------------------------------
   Connected: 10/10
   Queued: 10/10
   Matched: 10/10
   Errors: 0
--------------------------------------------------
   Match Times:
     Min: 1234ms
     Avg: 2456ms
     P50: 2100ms
     P95: 4500ms
     Max: 5200ms
==================================================
```
