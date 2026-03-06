import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { Server, Socket } from 'socket.io';
import { generatePositionTask, generatePositionTasks, generateDeleteTasks, checkPositionTask } from './tasks.js';
import type { KeystrokeSource, PositionTask, PracticeSummary, Task, TaskKeystrokeSubmission, TaskResponse } from './types.js';
import type { 
  ClientToServerEvents, 
  ServerToClientEvents, 
  InterServerEvents, 
  SocketData 
} from './multiplayer/types.js';
import { RoomManager } from './multiplayer/roomManager.js';
import { BACKEND_PORT, CORS_ORIGINS } from './config.js';
import { verifyMatchToken, extractTokenFromHandshake } from './auth/auth.js';
import { socketRateLimiter } from './rateLimit/socketRateLimiter.js';
import { connectionLimiter } from './rateLimit/connectionLimiter.js';
import { 
  validatePlayerName, 
  validateRoomId, 
  validateOptionalRoomId,
  validateCursorOffset, 
  validateEditorText,
  validateBoolean,
  validateKeystrokeEvents,
} from './validation/inputValidation.js';

// Create Fastify with its own server
const fastify = Fastify({
  logger: true
});

// Enable CORS for frontend
await fastify.register(cors, {
  origin: CORS_ORIGINS,
});

// HTTP rate limiting
await fastify.register(fastifyRateLimit, {
  max: 100,           // 100 requests
  timeWindow: '1 minute',
  // Skip rate limiting for health check
  allowList: (req: { url?: string }) => req.url === '/',
});

// Store active tasks with TTL to prevent unbounded memory growth
const ACTIVE_TASKS_MAX = 10_000;
const ACTIVE_TASKS_TTL_MS = 5 * 60 * 1000;
const activeTasks = new Map<string, { task: PositionTask; createdAt: number }>();

// Task-end keystroke telemetry. In-memory for now; can be swapped for DB persistence later.
const KEYSTROKE_RECORDS_MAX = 20_000;
const KEYSTROKE_RECORDS_TTL_MS = 60 * 60 * 1000;
const taskKeystrokeRecords = new Map<string, { data: TaskKeystrokeSubmission; createdAt: number }>();

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

// Shuffle array helper
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j] as T;
    result[j] = temp as T;
  }
  return result;
}

// Basic root health check (used by allowList for rate limiting)
fastify.get('/', async () => {
  return { status: 'ok', service: 'vim-racing' };
});

// Get a new position task (single player)
fastify.get('/api/task/position', async (): Promise<TaskResponse> => {
  if (activeTasks.size >= ACTIVE_TASKS_MAX) {
    throw new Error('Too many active tasks');
  }
  const task = generatePositionTask();
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

  if (taskType !== 'navigate' && taskType !== 'delete' && taskType !== 'change') {
    return { success: false, error: 'Invalid task type' };
  }

  if (!Number.isInteger(startedAt) || !Number.isInteger(completedAt) || completedAt < startedAt) {
    return { success: false, error: 'Invalid task timestamps' };
  }

  if (typeof roomId !== 'undefined') {
    const roomIdResult = validateRoomId(roomId);
    if (!roomIdResult.valid) {
      return { success: false, error: roomIdResult.error || 'Invalid room ID' };
    }
  }

  if (typeof playerId !== 'undefined' && (typeof playerId !== 'string' || playerId.length < 1 || playerId.length > 64)) {
    return { success: false, error: 'Invalid player ID' };
  }

  const eventsResult = validateKeystrokeEvents(events);
  if (!eventsResult.valid) {
    return { success: false, error: eventsResult.error || 'Invalid keystroke events' };
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
  taskKeystrokeRecords.set(recordId, { data: submission, createdAt: Date.now() });
  console.log(
    JSON.stringify(
      Array.from(taskKeystrokeRecords.entries()).map(([id, rec]) => ({
        id,
        ...rec.data,
        createdAt: rec.createdAt,
      })),
      null,
      2
    )
  );
  return {
    success: true,
    recordedEventCount: submission.events.length,
  };
});

// Get a practice session (10 tasks: 5 position + 5 delete, shuffled)
fastify.get('/api/task/practice', async () => {
  const NUM_TASKS = 10;
  const tasksPerType = Math.floor(NUM_TASKS / 2);
  
  const positionTasks: Task[] = generatePositionTasks(tasksPerType);
  const deleteTasks: Task[] = generateDeleteTasks(tasksPerType);
  const allTasks = [...positionTasks, ...deleteTasks];
  const navigateTasksWithRecommendation = positionTasks.reduce((count, task) => {
    if (task.type !== 'navigate') return count;
    return task.recommendedSequence && typeof task.recommendedWeight === 'number' ? count + 1 : count;
  }, 0);
  const deleteTasksWithRecommendation = deleteTasks.reduce((count, task) => {
    if (task.type !== 'delete') return count;
    return task.recommendedSequence && typeof task.recommendedWeight === 'number' ? count + 1 : count;
  }, 0);
  const practiceSummary: PracticeSummary = {
    totalTasks: allTasks.length,
    navigateTasks: positionTasks.length,
    deleteTasks: deleteTasks.length,
    navigateTasksWithRecommendation,
    deleteTasksWithRecommendation,
  };
  
  return {
    tasks: allTasks,
    numTasks: NUM_TASKS,
    practiceSummary,
    startTime: Date.now(),
  };
});

// Memory-aware health check for Fly.io auto-restart
const MEMORY_LIMIT_MB = 200;
let roomManager: RoomManager | null = null;

fastify.get('/health', async (request, reply) => {
  const memMB = process.memoryUsage().rss / 1024 / 1024;
  const rooms = roomManager?.roomCount ?? 0;
  if (memMB > MEMORY_LIMIT_MB) {
    return reply.status(503).send({ status: 'unhealthy', memMB: Math.round(memMB), rooms });
  }
  return { status: 'ok', memMB: Math.round(memMB), rooms };
});

// Start Fastify first, then attach Socket.IO
await fastify.listen({ port: BACKEND_PORT, host: '0.0.0.0' });

// Now attach Socket.IO to the Fastify server
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(fastify.server, {
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
function getClientIp(handshake: { headers: Record<string, string | string[] | undefined>; address: string }): string {
  const forwarded = handshake.headers['x-forwarded-for'];
  if (forwarded) {
    const raw = typeof forwarded === 'string' ? forwarded : forwarded[0] ?? '';
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
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

  const isLoadTest = LOAD_TEST_SECRET && socket.handshake.auth?.loadTestSecret === LOAD_TEST_SECRET;
  
  // Check and register connection (bypass for load tests)
  if (!isLoadTest && !connectionLimiter.addConnection(ip, socket.id)) {
    console.log(`🚫 Connection limit exceeded for IP ${ip} (${connectionLimiter.getConnectionCount(ip)} connections)`);
    return next(new Error('Too many connections from your IP. Please try again later.'));
  }
  
  console.log(`📊 Connection from ${ip} (${connectionLimiter.getConnectionCount(ip)}/${10} for this IP)`);
  next();
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
  
  socket.data.userId = authResult.userId!;
  if (authResult.matchedRoomId) {
    socket.data.matchedRoomId = authResult.matchedRoomId;
  }
  console.log(`🔒 Auth success: userId=${authResult.userId}`);
  next();
});

// Initialize room manager (assigned to the variable declared before listen)
roomManager = new RoomManager(io);

// Helper to wrap socket event handlers with rate limiting
type SocketType = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function rateLimitedHandler<T>(
  socket: SocketType,
  eventName: string,
  handler: (data: T) => void
): (data: T) => void {
  return (data: T) => {
    const result = socketRateLimiter.check(socket.id, eventName);
    if (!result.allowed) {
      console.log(`⚠️ Rate limited ${socket.id} on ${eventName} (reset in ${result.resetIn}ms)`);
      socket.emit('room:error', { message: 'Too many requests. Please slow down.' });
      return;
    }
    if (data === null || data === undefined || typeof data !== 'object') {
      socket.emit('room:error', { message: 'Invalid request data' });
      return;
    }
    try {
      handler(data);
    } catch (err) {
      console.error(`Uncaught error in ${eventName}:`, err instanceof Error ? err.message : err);
      socket.emit('room:error', { message: 'Internal error' });
    }
  };
}

// Rate limited handler for events with no data
function rateLimitedVoidHandler(
  socket: SocketType,
  eventName: string,
  handler: () => void
): () => void {
  return () => {
    const result = socketRateLimiter.check(socket.id, eventName);
    if (!result.allowed) {
      console.log(`⚠️ Rate limited ${socket.id} on ${eventName} (reset in ${result.resetIn}ms)`);
      socket.emit('room:error', { message: 'Too many requests. Please slow down.' });
      return;
    }
    try {
      handler();
    } catch (err) {
      console.error(`Uncaught error in ${eventName}:`, err instanceof Error ? err.message : err);
      socket.emit('room:error', { message: 'Internal error' });
    }
  };
}

// Socket.IO connection handling
// This creates sockets when first connecting to the server,
// and also routes already created sockets to the correct handler.
// all sockets accessable via io.sockets.sockets // io.sockets.sockets.get('abc...')

io.on('connection', (socket) => {
  console.log(`🔌 Player connected: ${socket.id} (userId: ${socket.data.userId})`);

  // Create a new room
  socket.on('room:create', rateLimitedHandler(socket, 'room:create', ({ playerName, roomId: externalRoomId, isPublic }) => {
    // Validate inputs
    const nameResult = validatePlayerName(playerName);
    const roomIdResult = validateOptionalRoomId(externalRoomId);
    const isPublicResult = validateBoolean(isPublic);
    
    if (!roomIdResult.valid) {
      socket.emit('room:error', { message: roomIdResult.error || 'Invalid room ID' });
      return;
    }
    
    const safeName = nameResult.value!;
    const safeRoomId = roomIdResult.value;
    const safeIsPublic = isPublicResult.value!;
    
    console.log(`📥 room:create received: playerName=${safeName}, roomId=${safeRoomId}, isPublic=${safeIsPublic}`);
    const room = roomManager.createRoom(socket, safeName, safeRoomId, safeIsPublic);
    if (!room) return;
    const player = room.players.get(socket.id)!;
    socket.emit('room:created', { 
      roomId: room.id, 
      player,
    });
  }));

  // Join an existing room
  socket.on('room:join', rateLimitedHandler(socket, 'room:join', ({ roomId, playerName }) => {
    // Validate inputs
    const nameResult = validatePlayerName(playerName);
    const roomIdResult = validateRoomId(roomId);
    
    if (!roomIdResult.valid) {
      socket.emit('room:error', { message: roomIdResult.error || 'Invalid room ID' });
      return;
    }
    
    const safeName = nameResult.value!;
    const safeRoomId = roomIdResult.value!;
    
    const room = roomManager.joinRoom(socket, safeRoomId, safeName);
    if (room) {
      socket.emit('room:joined', {
        roomId: room.id,
        players: roomManager.getPlayersArray(room),
      });
    }
  }));

  // Join a matched room (from matchmaking) - creates room if first player, joins if second
  socket.on('room:join_matched', rateLimitedHandler(socket, 'room:join_matched', ({ roomId, playerName }) => {
    // Validate inputs
    const nameResult = validatePlayerName(playerName);
    const roomIdResult = validateRoomId(roomId);
    
    if (!roomIdResult.valid) {
      socket.emit('room:error', { message: roomIdResult.error || 'Invalid room ID' });
      return;
    }
    
    const safeName = nameResult.value!;
    const safeRoomId = roomIdResult.value!;

    // Enforce that the token's roomId matches the requested room
    if (socket.data.matchedRoomId && socket.data.matchedRoomId !== safeRoomId) {
      socket.emit('room:error', { message: 'Room ID does not match your match token' });
      return;
    }
    
    console.log(`📥 room:join_matched: roomId=${safeRoomId}, playerName=${safeName}`);
    
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
      const room = roomManager.createRoom(socket, safeName, safeRoomId, true);
      if (!room) return;
      const player = room.players.get(socket.id)!;
      socket.emit('room:created', { 
        roomId: room.id, 
        player,
      });
    }
  }));

  // Quick match - find or create a room automatically
  socket.on('room:quick_match', rateLimitedHandler(socket, 'room:quick_match', ({ playerName }) => {
    const startTime = performance.now();
    // Validate input
    const nameResult = validatePlayerName(playerName);
    const safeName = nameResult.value!;
    
    const result = roomManager.findOrCreateQuickMatchRoom(socket, safeName);
    if (!result) return;
    const { room, isNewRoom } = result;
    const player = room.players.get(socket.id)!;
    
    console.log(`⏱️ [quick_match] ${safeName} → ${isNewRoom ? 'created' : 'joined'} room ${room.id} (${(performance.now() - startTime).toFixed(0)}ms)`);
    
    if (isNewRoom) {
      socket.emit('room:created', { roomId: room.id, player });
    } else {
      socket.emit('room:joined', {
        roomId: room.id,
        players: roomManager.getPlayersArray(room),
      });
    }
  }));

  // Leave room
  socket.on('room:leave', rateLimitedVoidHandler(socket, 'room:leave', () => {
    roomManager.leaveRoom(socket);
  }));

  // Play again (reset room for new game)
  socket.on('player:ready_to_play', rateLimitedVoidHandler(socket, 'player:ready_to_play', () => {
    roomManager.playerReadyToPlay(socket);
  }));

  // Handle cursor movement during race
  socket.on('player:cursor', rateLimitedHandler(socket, 'player:cursor', ({ offset }) => {
    // Validate cursor offset
    const offsetResult = validateCursorOffset(offset);
    if (!offsetResult.valid) {
      // Silently ignore invalid cursor data during gameplay
      return;
    }
    roomManager.handleCursorMove(socket, offsetResult.value!);
  }));

  // Handle editor text for delete task validation
  socket.on('player:editorText', rateLimitedHandler(socket, 'player:editorText', ({ text }) => {
    // Validate editor text
    const textResult = validateEditorText(text);
    if (!textResult.valid) {
      socket.emit('room:error', { message: textResult.error || 'Invalid editor content' });
      return;
    }
    roomManager.handleEditorText(socket, textResult.value!);
  }));

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

console.log(`\n🏎️  Vim Racing BACKEND running at http://localhost:${BACKEND_PORT}`);
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
