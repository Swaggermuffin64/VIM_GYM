import 'dotenv/config';
import WebSocket from 'ws';

// Configuration from environment
// Usage:
//   Local:      NUM_PLAYERS=10 tsx scripts/load-test.ts
//   Production: PROD=1 NUM_PLAYERS=10 tsx scripts/load-test.ts
//   Custom URL: MATCHMAKING_URL=wss://custom.example.com NUM_PLAYERS=10 tsx scripts/load-test.ts

const LOCAL_URL = 'ws://localhost:3002';
const PROD_URL = 'wss://vim-racing-matchmaker.fly.dev';

const MATCHMAKING_URL =
  process.env.MATCHMAKING_URL || (process.env.PROD ? PROD_URL : LOCAL_URL);

if (!process.env.MATCHMAKING_URL && !process.env.PROD) {
  console.log('ℹ️  No MATCHMAKING_URL set, defaulting to local:', LOCAL_URL);
}
const LOAD_TEST_SECRET = process.env.LOAD_TEST_SECRET || '';
const NUM_PLAYERS = parseInt(process.env.NUM_PLAYERS || '10', 10);
const STAGGER_MS = parseInt(process.env.STAGGER_MS || '500', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '60000', 10);

// Stats tracking
const stats = {
  connected: 0,
  queued: 0,
  matched: 0,
  errors: 0,
  matchTimes: [] as number[],
  startTime: Date.now(),
};

// Track matches/rooms created
interface MatchInfo {
  roomId: string;
  connectionUrl: string;
  players: string[];
  createdAt: number;
}
const matches: Map<string, MatchInfo> = new Map();

const activeConnections: WebSocket[] = [];

function simulatePlayer(playerNum: number): Promise<void> {
  return new Promise((resolve) => {
    const playerName = `LoadTest_${playerNum}_${Date.now()}`;
    const queuedAt = Date.now();
    let resolved = false;

    const url = LOAD_TEST_SECRET
      ? `${MATCHMAKING_URL}?loadtest=${encodeURIComponent(LOAD_TEST_SECRET)}`
      : MATCHMAKING_URL;
    const ws = new WebSocket(url);
    activeConnections.push(ws);

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    // Timeout for this player
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.log(`[${playerName}] ⏰ Timeout waiting for match`);
        ws.close();
        cleanup();
      }
    }, TIMEOUT_MS);

    ws.on('open', () => {
      stats.connected++;
      console.log(`[${playerName}] 🔌 Connected`);
      ws.send(JSON.stringify({ type: 'queue:join', playerName }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'queue:joined':
            stats.queued++;
            console.log(
              `[${playerName}] 📋 Queued (playerId: ${msg.playerId})`
            );
            break;

          case 'match:found': {
            const matchTime = Date.now() - queuedAt;
            stats.matched++;
            stats.matchTimes.push(matchTime);
            console.log(
              `[${playerName}] ✅ Matched! Room: ${msg.roomId} (${matchTime}ms)`
            );

            // Track match info
            if (!matches.has(msg.roomId)) {
              matches.set(msg.roomId, {
                roomId: msg.roomId,
                connectionUrl: msg.connectionUrl,
                players: [],
                createdAt: Date.now(),
              });
            }
            matches.get(msg.roomId)!.players.push(playerName);

            clearTimeout(timeout);
            ws.close();
            cleanup();
            break;
          }

          case 'error':
            stats.errors++;
            console.error(`[${playerName}] ❌ Error: ${msg.message}`);
            clearTimeout(timeout);
            ws.close();
            cleanup();
            break;

          case 'pong':
            // Ignore pong responses
            break;

          default:
            console.log(`[${playerName}] 📨 Unknown message:`, msg);
        }
      } catch (err) {
        console.error(`[${playerName}] Failed to parse message:`, err);
      }
    });

    ws.on('error', (err) => {
      stats.errors++;
      console.error(`[${playerName}] ❌ WebSocket error:`, err.message);
      clearTimeout(timeout);
      cleanup();
    });

    ws.on('close', () => {
      console.log(`[${playerName}] 🔌 Disconnected`);
      clearTimeout(timeout);
      cleanup();
    });
  });
}

function printStats() {
  const duration = (Date.now() - stats.startTime) / 1000;

  console.log('\n' + '='.repeat(50));
  console.log('📊 LOAD TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`   Target: ${MATCHMAKING_URL}`);
  console.log(`   Players: ${NUM_PLAYERS}`);
  console.log(`   Stagger: ${STAGGER_MS}ms`);
  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log('-'.repeat(50));
  console.log(`   Connected: ${stats.connected}/${NUM_PLAYERS}`);
  console.log(`   Queued: ${stats.queued}/${NUM_PLAYERS}`);
  console.log(`   Matched: ${stats.matched}/${NUM_PLAYERS}`);
  console.log(`   Errors: ${stats.errors}`);

  if (stats.matchTimes.length > 0) {
    const avg =
      stats.matchTimes.reduce((a, b) => a + b, 0) / stats.matchTimes.length;
    const sorted = [...stats.matchTimes].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    console.log('-'.repeat(50));
    console.log('   Match Times:');
    console.log(`     Min: ${min}ms`);
    console.log(`     Avg: ${avg.toFixed(0)}ms`);
    console.log(`     P50: ${p50}ms`);
    console.log(`     P95: ${p95}ms`);
    console.log(`     Max: ${max}ms`);
  }

  // Print match details
  if (matches.size > 0) {
    console.log('-'.repeat(50));
    console.log(`   Rooms Created: ${matches.size}`);
    console.log('-'.repeat(50));
    console.log('');
    console.log('🎮 MATCHES:');
    console.log('');

    let roomNum = 1;
    for (const [roomId, match] of matches) {
      console.log(`   Room ${roomNum}: ${roomId}`);
      console.log(`   URL: ${match.connectionUrl}`);
      console.log(`   Players: ${match.players.join(' vs ')}`);
      console.log('');
      roomNum++;
    }
  }

  console.log('='.repeat(50) + '\n');
}

async function runLoadTest() {
  console.log('🚀 Starting Matchmaking Load Test');
  console.log(`   Target: ${MATCHMAKING_URL}`);
  console.log(`   Players: ${NUM_PLAYERS}`);
  console.log(`   Stagger: ${STAGGER_MS}ms between players`);
  console.log(`   Timeout: ${TIMEOUT_MS}ms per player`);
  console.log('');

  const promises: Promise<void>[] = [];

  // Spawn players with staggered timing
  for (let i = 0; i < NUM_PLAYERS; i++) {
    await new Promise((resolve) => setTimeout(resolve, STAGGER_MS));
    promises.push(simulatePlayer(i + 1));
  }

  // Wait for all players to complete (match or timeout)
  await Promise.all(promises);

  // Print final stats
  printStats();

  // Close any remaining connections
  activeConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  // Exit with error code if not all players matched
  const expectedMatches = Math.floor(NUM_PLAYERS / 2) * 2; // Round down to even
  if (stats.matched < expectedMatches) {
    console.log(
      `⚠️  Warning: Only ${stats.matched}/${expectedMatches} expected matches completed`
    );
    process.exit(1);
  }

  process.exit(0);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Interrupted by user');
  printStats();
  activeConnections.forEach((ws) => ws.close());
  process.exit(1);
});

// Run the test
runLoadTest().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
