import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { Server, Socket } from 'socket.io';
import { checkPositionTask } from './tasks.js';
import {
  generatePositionTaskAsync,
  pickTasksFromCache,
  waitForTaskCache,
} from './taskPool.js';
import type {
  KeystrokeSource,
  PositionTask,
  PracticeSummary,
  Task,
  TaskKeystrokeSubmission,
  TaskResponse,
} from './types.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from './multiplayer/types.js';
import { RoomManager } from './multiplayer/roomManager.js';
import { BACKEND_PORT, CORS_ORIGINS } from './config.js';
import { dbHealthCheck } from './db/pool.js';
import {
  insertSessionLeaderboardRow,
  isValidTasksPayload,
  LEADERBOARD_TASK_SCHEMA_VERSION,
  queryLeaderboardTop,
  queryLeaderboardTasks,
} from './db/leaderboard.js';
import {
  verifyMatchToken,
  extractTokenFromAuthHeader,
  extractTokenFromHandshake,
} from './auth/auth.js';
import { socketRateLimiter } from './rateLimit/socketRateLimiter.js';
import { connectionLimiter } from './rateLimit/connectionLimiter.js';
import { verifySupabaseToken, isSupabaseToken } from './auth/supabaseAuth.js';
import type { SupabaseUser } from './auth/supabaseAuth.js';
import { resolveSocketIdentity } from './auth/socketIdentity.js';
import { getProfile, upsertProfile } from './db/profiles.js';
import { getHeapStatistics } from 'v8';
import {
  validatePlayerName,
  validateRoomId,
  validateOptionalRoomId,
  validateCursorOffset,
  validateEditorText,
  validateBoolean,
  validateKeystrokeEvents,
} from './validation/inputValidation.js';

// Event loop lag tracker — measures how late setImmediate fires vs expected
let eventLoopLagMs = 0;
setInterval(() => {
  const start = Date.now();
  setImmediate(() => {
    eventLoopLagMs = Date.now() - start;
  });
}, 500).unref();

// Create Fastify with its own server
const fastify = Fastify({
  logger: true,
  disableRequestLogging: true,
});

// Enable CORS for frontend
await fastify.register(cors, {
  origin: CORS_ORIGINS,
});

// HTTP rate limiting
await fastify.register(fastifyRateLimit, {
  max: 100, // 100 requests
  timeWindow: '1 minute',
  // Skip rate limiting for health check
  allowList: (req: { url?: string }) => req.url === '/',
});

/**
 * Extract and verify a Supabase JWT from the Authorization header.
 * Returns the user on success, or sends a 401 and returns null.
 */
async function requireSupabaseAuth(
  request: { headers: { authorization?: string | string[] | undefined } },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } }
): Promise<SupabaseUser | null> {
  const token = extractTokenFromAuthHeader(request.headers);
  if (!token || !isSupabaseToken(token)) {
    reply
      .status(401)
      .send({ success: false, error: 'Authentication required' });
    return null;
  }
  const result = await verifySupabaseToken(token);
  if (!result.success || !result.user) {
    reply
      .status(401)
      .send({ success: false, error: result.error || 'Authentication failed' });
    return null;
  }
  return result.user;
}

// Store active tasks with TTL to prevent unbounded memory growth
const ACTIVE_TASKS_MAX = 10_000;
const ACTIVE_TASKS_TTL_MS = 5 * 60 * 1000;
const activeTasks = new Map<
  string,
  { task: PositionTask; createdAt: number }
>();

// Task-end keystroke telemetry. In-memory for now; can be swapped for DB persistence later.
const KEYSTROKE_RECORDS_MAX = 20_000;
const KEYSTROKE_RECORDS_TTL_MS = 60 * 60 * 1000;
const taskKeystrokeRecords = new Map<
  string,
  { data: TaskKeystrokeSubmission; createdAt: number }
>();

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of activeTasks) {
    if (now - entry.createdAt > ACTIVE_TASKS_TTL_MS) {
      activeTasks.delete(id);
    }
  }
}, 60_000);

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of taskKeystrokeRecords) {
    if (now - entry.createdAt > KEYSTROKE_RECORDS_TTL_MS) {
      taskKeystrokeRecords.delete(id);
    }
  }
}, 60_000);

// Basic root health check (used by allowList for rate limiting)
fastify.get('/', async () => {
  return { status: 'ok', service: 'vim-racing' };
});

fastify.get('/api/user/me', async (request, reply) => {
  const user = await requireSupabaseAuth(request, reply);
  if (!user) return;

  const profile = await getProfile(user.id);
  if (!profile) {
    return reply
      .status(404)
      .send({ success: false, error: 'Profile not found' });
  }

  return {
    success: true,
    profile: {
      id: profile.id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      is_premium: profile.is_premium,
      has_completed_onboarding: profile.has_completed_onboarding,
    },
  };
});

fastify.post<{
  Body: { display_name?: string; avatar_url?: string };
}>('/api/user/profile', async (request, reply) => {
  const user = await requireSupabaseAuth(request, reply);
  if (!user) return;

  const { display_name, avatar_url } = request.body;

  if (display_name === undefined) {
    return reply
      .status(400)
      .send({ success: false, error: 'display_name is required' });
  }

  const nameResult = validatePlayerName(display_name);
  if (!nameResult.valid) {
    return reply.status(400).send({ success: false, error: nameResult.error });
  }

  const profile = await upsertProfile(user.id, {
    display_name,
    avatar_url,
  });

  if (!profile) {
    return reply
      .status(500)
      .send({ success: false, error: 'Failed to update profile' });
  }

  return {
    success: true,
    profile: {
      id: profile.id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      is_premium: profile.is_premium,
      has_completed_onboarding: profile.has_completed_onboarding,
    },
  };
});

// Get a new position task (single player)
fastify.get('/api/task/position', async (): Promise<TaskResponse> => {
  if (activeTasks.size >= ACTIVE_TASKS_MAX) {
    throw new Error('Too many active tasks');
  }
  const task = await generatePositionTaskAsync();
  activeTasks.set(task.id, { task, createdAt: Date.now() });

  return {
    task,
    startTime: Date.now(),
  };
});

// Validate task completion
fastify.post<{
  Body: { taskId: string; cursorOffset: number };
}>('/api/task/validate', async (request) => {
  const { taskId, cursorOffset } = request.body;

  // Validate taskId format (should be a UUID-like string)
  if (typeof taskId !== 'string' || taskId.length < 1 || taskId.length > 100) {
    return { success: false, error: 'Invalid task ID' };
  }

  // Validate cursor offset
  const offsetResult = validateCursorOffset(cursorOffset);
  if (!offsetResult.valid) {
    return { success: false, error: offsetResult.error };
  }

  const entry = activeTasks.get(taskId);
  if (!entry) {
    return { success: false, error: 'Task not found' };
  }

  if (entry.task.type !== 'navigate') {
    return { success: false, error: 'Invalid task type' };
  }

  const isComplete = checkPositionTask(entry.task, offsetResult.value!);

  if (isComplete) {
    activeTasks.delete(taskId);
  }

  return {
    success: isComplete,
    cursorOffset: offsetResult.value,
  };
});
//currently we store in memory, maybe replace with db eventually
fastify.post<{
  Body: {
    source: KeystrokeSource;
    taskId: string;
    taskType: Task['type'];
    startedAt: number;
    completedAt: number;
    roomId?: string;
    playerId?: string;
    events: unknown;
  };
}>('/api/task/keystrokes', async (request) => {
  const {
    source,
    taskId,
    taskType,
    startedAt,
    completedAt,
    roomId,
    playerId,
    events,
  } = request.body;

  if (source !== 'practice' && source !== 'multiplayer') {
    return { success: false, error: 'Invalid source' };
  }

  if (typeof taskId !== 'string' || taskId.length < 1 || taskId.length > 100) {
    return { success: false, error: 'Invalid task ID' };
  }

  if (
    taskType !== 'navigate' &&
    taskType !== 'delete' &&
    taskType !== 'yank_paste'
  ) {
    return { success: false, error: 'Invalid task type' };
  }

  if (
    !Number.isInteger(startedAt) ||
    !Number.isInteger(completedAt) ||
    completedAt < startedAt
  ) {
    return { success: false, error: 'Invalid task timestamps' };
  }

  if (typeof roomId !== 'undefined') {
    const roomIdResult = validateRoomId(roomId);
    if (!roomIdResult.valid) {
      return { success: false, error: roomIdResult.error || 'Invalid room ID' };
    }
  }

  if (
    typeof playerId !== 'undefined' &&
    (typeof playerId !== 'string' ||
      playerId.length < 1 ||
      playerId.length > 64)
  ) {
    return { success: false, error: 'Invalid player ID' };
  }

  const eventsResult = validateKeystrokeEvents(events);
  if (!eventsResult.valid) {
    return {
      success: false,
      error: eventsResult.error || 'Invalid keystroke events',
    };
  }

  if (taskKeystrokeRecords.size >= KEYSTROKE_RECORDS_MAX) {
    const oldestKey = taskKeystrokeRecords.keys().next().value;
    if (oldestKey) {
      taskKeystrokeRecords.delete(oldestKey);
    }
  }

  const submission: TaskKeystrokeSubmission = {
    source,
    taskId,
    taskType,
    startedAt,
    completedAt,
    events: eventsResult.value!,
    ...(roomId ? { roomId } : {}),
    ...(playerId ? { playerId } : {}),
  };

  const recordId = `${source}:${taskId}:${completedAt}:${Math.random().toString(36).slice(2, 8)}`;
  taskKeystrokeRecords.set(recordId, {
    data: submission,
    createdAt: Date.now(),
  });
  request.log.debug(
    {
      recordId,
      source,
      taskId,
      taskType,
      eventCount: submission.events.length,
      storeSize: taskKeystrokeRecords.size,
    },
    'recorded task keystrokes'
  );
  return {
    success: true,
    recordedEventCount: submission.events.length,
  };
});

/** Persist a finished practice or client-reported session (ordered tasks for replay). */
fastify.post<{
  Body: {
    play_mode: string;
    duration_ms: number;
    tasks: unknown;
    task_schema_version?: number;
  };
}>('/api/leaderboard/session', async (request, reply) => {
  const { play_mode, duration_ms, tasks, task_schema_version } = request.body;

  const authUser = await requireSupabaseAuth(request, reply);
  if (!authUser) return;

  const profile = await getProfile(authUser.id);
  if (!profile) {
    return reply
      .status(404)
      .send({ success: false, error: 'Profile not found' });
  }

  const player_id = authUser.id;
  const display_name = profile.display_name;

  request.log.info(
    {
      path: '/api/leaderboard/session',
      play_mode,
      taskCount: Array.isArray(tasks) ? tasks.length : null,
    },
    'leaderboard session request'
  );

  if (
    typeof play_mode !== 'string' ||
    play_mode.length < 1 ||
    play_mode.length > 64
  ) {
    request.log.warn(
      { err: 'Invalid play_mode' },
      'leaderboard session rejected'
    );
    return reply
      .status(400)
      .send({ success: false, error: 'Invalid play_mode' });
  }

  if (play_mode !== 'practice') {
    request.log.warn(
      { err: 'play_mode not practice' },
      'leaderboard session rejected'
    );
    return reply.status(400).send({
      success: false,
      error:
        'Only practice sessions are accepted via this endpoint; multiplayer is recorded server-side',
    });
  }

  if (!Number.isFinite(duration_ms) || duration_ms < 1) {
    request.log.warn(
      { err: 'Invalid duration_ms', duration_ms },
      'leaderboard session rejected'
    );
    return reply
      .status(400)
      .send({ success: false, error: 'Invalid duration_ms' });
  }

  const schemaVersion =
    typeof task_schema_version === 'number' &&
    Number.isInteger(task_schema_version)
      ? task_schema_version
      : LEADERBOARD_TASK_SCHEMA_VERSION;

  if (schemaVersion !== LEADERBOARD_TASK_SCHEMA_VERSION) {
    request.log.warn(
      { err: 'Unsupported task_schema_version', task_schema_version },
      'leaderboard session rejected'
    );
    return reply
      .status(400)
      .send({ success: false, error: 'Unsupported task_schema_version' });
  }

  if (!isValidTasksPayload(tasks)) {
    request.log.warn(
      {
        err: 'Invalid tasks',
        isArray: Array.isArray(tasks),
        length: Array.isArray(tasks) ? tasks.length : null,
      },
      'leaderboard session rejected'
    );
    return reply.status(400).send({ success: false, error: 'Invalid tasks' });
  }

  const result = await insertSessionLeaderboardRow({
    playMode: play_mode,
    durationMs: duration_ms,
    tasks,
    playerId: player_id,
    displayName: display_name,
    userId: authUser.id,
  });

  if (result.status === 'inserted') {
    request.log.info(
      { persisted: true, ranks: result.ranks },
      'leaderboard session stored'
    );
    return { success: true, persisted: true, ranks: result.ranks };
  }

  if (result.status === 'skipped') {
    request.log.warn(
      { persisted: false, reason: result.reason },
      'leaderboard session not stored'
    );
    return { success: true, persisted: false, reason: result.reason };
  }

  request.log.error(
    { persisted: false, reason: result.reason },
    'leaderboard session insert failed'
  );
  return reply
    .status(500)
    .send({ success: false, error: 'Database insert failed' });
});

fastify.get<{
  Querystring: { limit?: string; play_mode?: string; time_range?: string };
}>('/api/leaderboard', async (request, reply) => {
  const limitRaw = request.query.limit;
  const parsedLimit = limitRaw !== undefined ? Number(limitRaw) : 30;
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 30;
  const play_mode = (request.query.play_mode ?? 'all').trim().toLowerCase();
  const time_range = (request.query.time_range ?? 'all_time')
    .trim()
    .toLowerCase();

  const result = await queryLeaderboardTop({
    limit,
    playMode: play_mode,
    timeRange: time_range,
  });

  if (!result.ok) {
    return reply.status(400).send({ success: false, error: result.error });
  }

  return {
    success: true,
    entries: result.entries,
    databaseConfigured: result.databaseConfigured,
  };
});

fastify.get<{
  Params: { id: string };
}>('/api/leaderboard/:id/tasks', async (request, reply) => {
  const { id } = request.params;
  if (!/^\d+$/.test(id)) {
    return reply.status(400).send({ success: false, error: 'Invalid id' });
  }

  const result = await queryLeaderboardTasks(id);
  if (!result.ok) {
    return reply.status(404).send({ success: false, error: result.error });
  }

  return { success: true, tasks: result.tasks };
});

fastify.get<{
  Params: { roomId: string };
}>('/api/multiplayer/stats/:roomId', async (request, reply) => {
  const roomIdResult = validateRoomId(request.params.roomId);
  if (!roomIdResult.valid || !roomIdResult.value) {
    return reply
      .status(400)
      .send({ success: false, error: roomIdResult.error || 'Invalid room ID' });
  }

  const roomId = roomIdResult.value;
  const room = roomManager?.getRoom(roomId);
  const allowTokenlessStats = room?.isPublic === false;

  const token = extractTokenFromAuthHeader(request.headers);
  const authResult = verifyMatchToken(token);

  // Private rooms have no match token, so allow tokenless stats access
  // only when we can confirm this is an active private room.
  if (!allowTokenlessStats) {
    if (!authResult.success || !authResult.matchedRoomId) {
      return reply
        .status(401)
        .send({ success: false, error: 'Authentication required' });
    }
    if (authResult.matchedRoomId !== roomId) {
      return reply
        .status(403)
        .send({ success: false, error: 'Forbidden for this room' });
    }
  }

  const summaries = new Map<
    string,
    { taskCount: number; totalDurationMs: number; totalKeys: number }
  >();

  for (const { data } of taskKeystrokeRecords.values()) {
    if (data.source !== 'multiplayer') continue;
    if (!data.roomId || data.roomId !== roomId) continue;
    if (!data.playerId) continue;

    const durationMs = Math.max(0, data.completedAt - data.startedAt);
    const existing = summaries.get(data.playerId) || {
      taskCount: 0,
      totalDurationMs: 0,
      totalKeys: 0,
    };
    existing.taskCount += 1;
    existing.totalDurationMs += durationMs;
    existing.totalKeys += data.events.length;
    summaries.set(data.playerId, existing);
  }

  return {
    success: true,
    roomId,
    players: Array.from(summaries.entries()).map(([playerId, agg]) => {
      const keysPerSecond =
        agg.totalDurationMs > 0
          ? agg.totalKeys / (agg.totalDurationMs / 1000)
          : 0;
      const avgDurationMs =
        agg.taskCount > 0 ? agg.totalDurationMs / agg.taskCount : 0;
      const avgKeys =
        agg.taskCount > 0 ? Math.round(agg.totalKeys / agg.taskCount) : 0;

      return {
        playerId,
        taskCount: agg.taskCount,
        keysPerSecond,
        avgDurationMs,
        avgKeys,
      };
    }),
  };
});

// Get a practice session (10 tasks: 4 navigate + 4 delete + 2 yank_paste, shuffled)
fastify.get('/api/task/practice', async () => {
  const allTasks = pickTasksFromCache();

  const navigateTasksWithRecommendation = allTasks.reduce((count, task) => {
    if (task.type !== 'navigate') return count;
    return task.recommendedSequence &&
      typeof task.recommendedWeight === 'number'
      ? count + 1
      : count;
  }, 0);
  const deleteTasksWithRecommendation = allTasks.reduce((count, task) => {
    if (task.type !== 'delete') return count;
    return task.recommendedSequence &&
      typeof task.recommendedWeight === 'number'
      ? count + 1
      : count;
  }, 0);
  const practiceSummary: PracticeSummary = {
    totalTasks: allTasks.length,
    navigateTasks: allTasks.filter((t) => t.type === 'navigate').length,
    deleteTasks: allTasks.filter((t) => t.type === 'delete').length,
    navigateTasksWithRecommendation,
    deleteTasksWithRecommendation,
  };

  return {
    tasks: allTasks,
    numTasks: allTasks.length,
    practiceSummary,
    startTime: Date.now(),
  };
});

// Memory-aware health check for Fly.io auto-restart
const MEMORY_LIMIT_MB = 200;
let roomManager: RoomManager | null = null;

fastify.get('/health', async (request, reply) => {
  const mem = process.memoryUsage();
  const heap = getHeapStatistics();
  const rssMB = mem.rss / 1024 / 1024;

  if (rssMB > MEMORY_LIMIT_MB) {
    return reply.status(503).send({
      status: 'unhealthy',
      memMB: Math.round(rssMB),
      rooms: roomManager?.roomCount ?? 0,
    });
  }

  const database = await dbHealthCheck();

  return {
    status: 'ok',
    // Memory
    memMB: Math.round(rssMB),
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    // GC / heap internals
    heapSizeLimit: Math.round(heap.heap_size_limit / 1024 / 1024),
    mallocedMB: Math.round(heap.malloced_memory / 1024 / 1024),
    peakMallocedMB: Math.round(heap.peak_malloced_memory / 1024 / 1024),
    // Event loop
    eventLoopLagMs,
    // Rooms
    rooms: roomManager?.roomCount ?? 0,
    roomsByState: roomManager?.roomsByState ?? {},
    // Connections
    socketConnections: io.engine.clientsCount,
    // Process
    uptimeS: Math.round(process.uptime()),
    database,
  };
});

// Wait for the pre-generated task cache before accepting connections
const TASK_CACHE_TIMEOUT_MS = 60_000;
await Promise.race([
  waitForTaskCache(),
  new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            `Task cache generation timed out after ${TASK_CACHE_TIMEOUT_MS}ms`
          )
        ),
      TASK_CACHE_TIMEOUT_MS
    )
  ),
]).catch((err) => {
  console.error('[Startup] Fatal:', err.message);
  process.exit(1);
});

// Start Fastify first, then attach Socket.IO
await fastify.listen({ port: BACKEND_PORT, host: '0.0.0.0' });

// Now attach Socket.IO to the Fastify server
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(fastify.server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 64 * 1024,
});

/**
 * Extract client IP from Socket.IO handshake.
 * Uses the rightmost X-Forwarded-For entry (added by the closest trusted proxy)
 * rather than the leftmost (which is client-controlled and spoofable).
 */
function getClientIp(handshake: {
  headers: Record<string, string | string[] | undefined>;
  address: string;
}): string {
  const forwarded = handshake.headers['x-forwarded-for'];
  if (forwarded) {
    const raw =
      typeof forwarded === 'string' ? forwarded : (forwarded[0] ?? '');
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1]!;
    }
  }
  return handshake.address || 'unknown';
}

const LOAD_TEST_SECRET = process.env.LOAD_TEST_SECRET || '';

// Connection limit middleware - runs first
io.use((socket, next) => {
  const ip = getClientIp(socket.handshake);

  // Store IP on socket for later cleanup
  socket.data.clientIp = ip;

  const isLoadTest =
    LOAD_TEST_SECRET &&
    socket.handshake.auth?.loadTestSecret === LOAD_TEST_SECRET;

  socket.data.isLoadTest = !!isLoadTest;

  // Check and register connection (bypass for load tests)
  if (!isLoadTest && !connectionLimiter.addConnection(ip, socket.id)) {
    console.log(
      `🚫 Connection limit exceeded for IP ${ip} (${connectionLimiter.getConnectionCount(ip)} connections)`
    );
    return next(
      new Error('Too many connections from your IP. Please try again later.')
    );
  }

  console.log(
    `📊 Connection from ${ip} (${connectionLimiter.getConnectionCount(ip)}/${10} for this IP)`
  );
  next();
});

// Resolve Supabase identity + profile — every multiplayer connection must
// be authenticated; there is no anonymous/guest path.
io.use((socket, next) => {
  const userToken = socket.handshake.auth?.userToken as string | undefined;
  resolveSocketIdentity(userToken)
    .then((result) => {
      if (!result.ok) {
        const ip = socket.data.clientIp || 'unknown';
        connectionLimiter.removeConnection(ip, socket.id);
        console.log(
          `🔒 Socket identity rejected for ${socket.id}: ${result.error}`
        );
        next(new Error(result.error));
        return;
      }
      socket.data.userId = result.userId;
      socket.data.displayName = result.displayName;
      next();
    })
    .catch((err) => {
      console.error('🔒 Socket identity resolution failed', err);
      next(new Error('Authentication failed'));
    });
});

// Authentication middleware for Socket.IO
// Verifies match tokens for quick-match connections; allows direct connections for private rooms
io.use((socket, next) => {
  const token = extractTokenFromHandshake(socket.handshake);
  const authResult = verifyMatchToken(token);

  if (!authResult.success) {
    const ip = socket.data.clientIp || 'unknown';
    connectionLimiter.removeConnection(ip, socket.id);

    console.log(`🔒 Auth failed for socket ${socket.id}: ${authResult.error}`);
    return next(new Error(authResult.error || 'Authentication failed'));
  }

  // Prefer Supabase-verified user ID over ephemeral match token player ID
  if (!socket.data.userId) {
    socket.data.userId = authResult.userId!;
  }
  if (authResult.matchedRoomId) {
    socket.data.matchedRoomId = authResult.matchedRoomId;
  }
  console.log(`🔒 Auth success: userId=${authResult.userId}`);
  next();
});

// Initialize room manager (assigned to the variable declared before listen)
roomManager = new RoomManager(io);

// Helper to wrap socket event handlers with rate limiting
type SocketType = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

function rateLimitedHandler<T>(
  socket: SocketType,
  eventName: string,
  handler: (data: T) => void | Promise<void>
): (data: T) => void {
  return (data: T) => {
    const result = socketRateLimiter.check(socket.id, eventName);
    if (!result.allowed) {
      console.log(
        `⚠️ Rate limited ${socket.id} on ${eventName} (reset in ${result.resetIn}ms)`
      );
      socket.emit('room:error', {
        message: 'Too many requests. Please slow down.',
      });
      return;
    }
    if (data === null || data === undefined || typeof data !== 'object') {
      socket.emit('room:error', { message: 'Invalid request data' });
      return;
    }
    try {
      const maybePromise = handler(data);
      if (maybePromise instanceof Promise) {
        maybePromise.catch((err) => {
          console.error(
            `Async error in ${eventName}:`,
            err instanceof Error ? err.message : err
          );
          socket.emit('room:error', { message: 'Internal error' });
        });
      }
    } catch (err) {
      console.error(
        `Uncaught error in ${eventName}:`,
        err instanceof Error ? err.message : err
      );
      socket.emit('room:error', { message: 'Internal error' });
    }
  };
}

// Rate limited handler for events with no data
function rateLimitedVoidHandler(
  socket: SocketType,
  eventName: string,
  handler: () => void | Promise<void>
): () => void {
  return () => {
    const result = socketRateLimiter.check(socket.id, eventName);
    if (!result.allowed) {
      console.log(
        `⚠️ Rate limited ${socket.id} on ${eventName} (reset in ${result.resetIn}ms)`
      );
      socket.emit('room:error', {
        message: 'Too many requests. Please slow down.',
      });
      return;
    }
    try {
      const maybePromise = handler();
      if (maybePromise instanceof Promise) {
        maybePromise.catch((err) => {
          console.error(
            `Async error in ${eventName}:`,
            err instanceof Error ? err.message : err
          );
          socket.emit('room:error', { message: 'Internal error' });
        });
      }
    } catch (err) {
      console.error(
        `Uncaught error in ${eventName}:`,
        err instanceof Error ? err.message : err
      );
      socket.emit('room:error', { message: 'Internal error' });
    }
  };
}

// Socket.IO connection handling
// This creates sockets when first connecting to the server,
// and also routes already created sockets to the correct handler.
// all sockets accessable via io.sockets.sockets // io.sockets.sockets.get('abc...')

io.on('connection', (socket) => {
  console.log(
    `🔌 Player connected: ${socket.id} (userId: ${socket.data.userId})`
  );

  // Create a new room
  socket.on(
    'room:create',
    rateLimitedHandler(
      socket,
      'room:create',
      async ({ roomId: externalRoomId, isPublic }) => {
        const roomIdResult = validateOptionalRoomId(externalRoomId);
        const isPublicResult = validateBoolean(isPublic);

        if (!roomIdResult.valid) {
          socket.emit('room:error', {
            message: roomIdResult.error || 'Invalid room ID',
          });
          return;
        }

        const safeName = socket.data.displayName!;
        const safeRoomId = roomIdResult.value;
        const safeIsPublic = isPublicResult.value!;

        console.log(
          `📥 room:create received: playerName=${safeName}, roomId=${safeRoomId}, isPublic=${safeIsPublic}`
        );
        const room = await roomManager.createRoom(
          socket,
          safeName,
          safeRoomId,
          safeIsPublic
        );
        if (!room) return;
      }
    )
  );

  // Join an existing room
  socket.on(
    'room:join',
    rateLimitedHandler(socket, 'room:join', ({ roomId }) => {
      const roomIdResult = validateRoomId(roomId);

      if (!roomIdResult.valid) {
        socket.emit('room:error', {
          message: roomIdResult.error || 'Invalid room ID',
        });
        return;
      }

      const safeName = socket.data.displayName!;
      const safeRoomId = roomIdResult.value!;

      const room = roomManager.joinRoom(socket, safeRoomId, safeName);
      if (room) {
        socket.emit('room:joined', {
          roomId: room.id,
          players: roomManager.getPlayersArray(room),
        });
      }
    })
  );

  // Join a matched room (from matchmaking) - creates room if first player, joins if second
  socket.on(
    'room:join_matched',
    rateLimitedHandler(socket, 'room:join_matched', async ({ roomId }) => {
      const roomIdResult = validateRoomId(roomId);

      if (!roomIdResult.valid) {
        socket.emit('room:error', {
          message: roomIdResult.error || 'Invalid room ID',
        });
        return;
      }

      const safeName = socket.data.displayName!;
      const safeRoomId = roomIdResult.value!;

      // Enforce that the token's roomId matches the requested room
      if (
        socket.data.matchedRoomId &&
        socket.data.matchedRoomId !== safeRoomId
      ) {
        socket.emit('room:error', {
          message: 'Room ID does not match your match token',
        });
        return;
      }

      console.log(
        `📥 room:join_matched: roomId=${safeRoomId}, playerName=${safeName}`
      );

      // Check if room already exists (another matched player got here first)
      const existingRoom = roomManager.getRoom(safeRoomId);

      if (existingRoom) {
        // Room exists, join it
        const room = roomManager.joinRoom(socket, safeRoomId, safeName);
        if (room) {
          socket.emit('room:joined', {
            roomId: room.id,
            players: roomManager.getPlayersArray(room),
          });
        }
      } else {
        // First player to arrive - create the room with the matched roomId
        const room = await roomManager.createRoom(
          socket,
          safeName,
          safeRoomId,
          true
        );
        if (!room) return;
      }
    })
  );

  // Quick match - find or create a room automatically
  socket.on(
    'room:quick_match',
    rateLimitedHandler(socket, 'room:quick_match', async () => {
      const startTime = performance.now();
      const safeName = socket.data.displayName!;

      const result = await roomManager.findOrCreateQuickMatchRoom(
        socket,
        safeName
      );
      if (!result) return;
      const { room, isNewRoom } = result;

      console.log(
        `⏱️ [quick_match] ${safeName} → ${isNewRoom ? 'created' : 'joined'} room ${room.id} (${(performance.now() - startTime).toFixed(0)}ms)`
      );

      if (!isNewRoom) {
        socket.emit('room:joined', {
          roomId: room.id,
          players: roomManager.getPlayersArray(room),
        });
      }
    })
  );

  // Leave room
  socket.on(
    'room:leave',
    rateLimitedVoidHandler(socket, 'room:leave', () => {
      roomManager.leaveRoom(socket);
    })
  );

  // Play again (reset room for new game)
  socket.on(
    'player:ready_to_play',
    rateLimitedVoidHandler(socket, 'player:ready_to_play', async () => {
      await roomManager.playerReadyToPlay(socket);
    })
  );

  // Handle task completion (navigate: cursor offset; delete: editor text)
  socket.on(
    'player:task_complete',
    rateLimitedHandler(socket, 'player:task_complete', (data) => {
      const payload: { offset?: number; text?: string } = {};
      if (data.offset !== undefined) {
        const offsetResult = validateCursorOffset(data.offset);
        if (!offsetResult.valid) {
          socket.emit('room:error', { message: 'Invalid completion data' });
          return;
        }
        payload.offset = offsetResult.value!;
      }
      if (data.text !== undefined) {
        const textResult = validateEditorText(data.text);
        if (!textResult.valid) {
          socket.emit('room:error', {
            message: textResult.error || 'Invalid completion data',
          });
          return;
        }
        payload.text = textResult.value!;
      }
      roomManager.handleTaskComplete(socket, payload);
    })
  );

  // Handle editor text for delete task partial-edit guardrail
  socket.on(
    'player:editorText',
    rateLimitedHandler(socket, 'player:editorText', ({ text }) => {
      const textResult = validateEditorText(text);
      if (!textResult.valid) {
        socket.emit('room:error', {
          message: textResult.error || 'Invalid editor content',
        });
        return;
      }
      roomManager.handleEditorText(socket, textResult.value!);
    })
  );

  // Handle disconnect - no rate limit needed
  socket.on('disconnect', () => {
    console.log(`🔌 Player disconnected: ${socket.id}`);
    socketRateLimiter.removeSocket(socket.id);

    // Remove from connection limiter
    const ip = socket.data.clientIp || 'unknown';
    connectionLimiter.removeConnection(ip, socket.id);

    roomManager.leaveRoom(socket);
  });
});

console.log(
  `\n🏎️  Vim Racing BACKEND running at http://localhost:${BACKEND_PORT}`
);
console.log(`🔌 WebSocket server ready`);
console.log('');

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);

  // Close all socket connections
  io.disconnectSockets(true);

  // Close the Socket.IO server
  io.close(() => {
    console.log('Socket.IO server closed');
  });

  // Close Fastify
  await fastify.close();
  console.log('Server shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});
