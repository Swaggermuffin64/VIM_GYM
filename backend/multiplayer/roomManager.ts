import type { Server, Socket } from 'socket.io';
import { MAX_PLAYERS_PER_ROOM } from './types.js';
import type { 
  GameRoom, 
  Player, 
  ClientToServerEvents, 
  ServerToClientEvents,
  InterServerEvents,
  SocketData 
} from './types.js';
import { generateDeleteTasks, generatePositionTasks } from '../tasks.js';
import type { Task } from '../types.js';
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    if (temp !== undefined && result[j] !== undefined) {
      result[i] = result[j];
      result[j] = temp;
    }
  }
  return result;
}

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerRooms: Map<string, string> = new Map(); // playerId -> roomId
  private roomCleanupTimers: Map<string, NodeJS.Timeout> = new Map(); // roomId -> cleanup timer
  private waitingRoomTimers: Map<string, NodeJS.Timeout> = new Map(); // roomId -> waiting timeout
  private roomDestroyTimers: Map<string, NodeJS.Timeout> = new Map(); // roomId -> post-race destroy timer
  private io: GameServer;
  private NUM_TASKS: number = 10;
  private MIN_TASK_COMPLETION_MS = 150; // Reject completions faster than any human can react
  private ROOM_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle timeout for finished rooms
  private WAITING_ROOM_TIMEOUT_MS_PRIVATE = 5 * 60 * 1000; // 5 minutes for private rooms (friends coordinating)
  private WAITING_ROOM_TIMEOUT_MS_PUBLIC = 30 * 1000; // 30 seconds for public rooms (auto-ready should fire in ~2s)
  constructor(io: GameServer) {
    this.io = io;
  }

  private scheduleWaitingRoomTimeout(roomId: string, isPublic: boolean): void {
    // Clear any existing timer for this room
    this.cancelWaitingRoomTimeout(roomId);

    const timeoutMs = isPublic 
      ? this.WAITING_ROOM_TIMEOUT_MS_PUBLIC 
      : this.WAITING_ROOM_TIMEOUT_MS_PRIVATE;

    const timer = setTimeout(() => {
      const room = this.rooms.get(roomId);
      if (room && room.state === 'waiting') {
        console.log(`⏰ Room ${roomId} waiting timeout - no race started, cleaning up`);
        this.destroyRoom(roomId, 'Room closed due to inactivity');
      }
    }, timeoutMs);

    this.waitingRoomTimers.set(roomId, timer);
    console.log(`⏱️ Scheduled waiting timeout for room ${roomId} in ${timeoutMs / 1000}s (${isPublic ? 'public' : 'private'})`);
  }

  private cancelWaitingRoomTimeout(roomId: string): void {
    const timer = this.waitingRoomTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.waitingRoomTimers.delete(roomId);
    }
  }

  private generateRoomId(): string {
    // Generate a short, readable room code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  createRoom(socket: GameSocket, playerName: string, externalRoomId?: string, isPublic: boolean = false): GameRoom | null {
    console.log(`📥 createRoom called: playerName=${playerName}, externalRoomId=${externalRoomId}, isPublic=${isPublic} (type: ${typeof isPublic})`);
    
    const roomId = externalRoomId || this.generateRoomId();

    if (this.rooms.has(roomId)) {
      socket.emit('room:error', { message: 'Room already exists' });
      return null;
    }
    const playerId = socket.id;
    
    const player: Player = {
      id: playerId,
      name: playerName,
      successIndicator: { cursorOffset: 0, editorText: ''},
      taskProgress: 0, // 0 to NUM_TASKS - 1
      isFinished: false,
      readyToPlay: false
    };
    const tasksPerType = Math.floor(this.NUM_TASKS / 2);
    const positionTasks: Task[] = generatePositionTasks(tasksPerType);
    const deleteTasks: Task[] = generateDeleteTasks(tasksPerType);
    const allTasks = shuffle([...positionTasks, ...deleteTasks]);
    console.log('Generated tasks:', allTasks.map(t => t.type));
    
    //add a finished task to the end of the tasks array
    const finishedTask: Task = {
      id: '',
      type: 'navigate',
      description: '',
      codeSnippet: '',
      targetPosition: { line: 1, col: 0 },
      targetOffset: 0,
    };
    
    const room: GameRoom = {
      id: roomId,
      players: new Map([[playerId, player]]),
      tasks: [...allTasks, finishedTask],
      num_tasks: this.NUM_TASKS,
      state: 'waiting',
      isPublic,
    };

    this.rooms.set(roomId, room);
    this.playerRooms.set(playerId, roomId);
    
    // Join the socket.io room
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;
    socket.data.playerName = playerName;

    console.log(`🏠 Room ${roomId} created by ${playerName} (${isPublic ? 'public' : 'private'})`);
    
    // Schedule waiting room timeout - room will be destroyed if race doesn't start
    this.scheduleWaitingRoomTimeout(roomId, isPublic);
    
    return room;
  }
    

  joinRoom(socket: GameSocket, roomId: string, playerName: string): GameRoom | null {
    // Leave any existing room to prevent ghost players
    if (socket.data.roomId) {
      this.leaveRoom(socket);
    }

    const room = this.rooms.get(roomId);
    const playerId = socket.id;

    if (!room) {
      socket.emit('room:error', { message: 'Room not found' });
      return null;
    }

    if (room.state !== 'waiting') {
      socket.emit('room:error', { message: 'Race already in progress' });
      return null;
    }

    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      socket.emit('room:error', { message: 'Room is full' });
      return null;
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      successIndicator: {cursorOffset: 0, editorText: ''},
      taskProgress: 0,
      isFinished: false,
      readyToPlay:false
    };

    room.players.set(playerId, player);
    this.playerRooms.set(playerId, roomId);

    // Join the socket.io room
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;
    socket.data.playerName = playerName;

    console.log(`👤 ${playerName} joined room ${roomId}`);

    // Notify other players (not the player who joined)
    socket.to(roomId).emit('room:player_joined', { player });
    
    return room;
  }

  leaveRoom(socket: GameSocket): void {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;

    if (!roomId || !playerId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (!player) return;

    const keepPlayerForScoreboard = room.state === 'countdown' || room.state === 'racing' || room.state === 'finished';

    if (keepPlayerForScoreboard) {
      player.leftRace = true;
      // Mark as complete in backend state so the race can still conclude.
      // UI still shows DNF for players who left before finishing.
      if (!player.isFinished) {
        player.isFinished = true;
      }
    } else {
      room.players.delete(playerId);
    }

    this.playerRooms.delete(playerId);
    socket.leave(roomId);

    console.log(`👋 Player ${playerId} left room ${roomId}`);

    // Notify other players
    this.io.to(roomId).emit('room:player_left', { playerId });

    // Clean up empty rooms
    if (room.players.size === 0) {
      this.destroyRoom(roomId);
      return;
    }

    // Keep in-progress races running for remaining players.
    // This lets someone finish even if their opponent disconnects mid-game.
    if (room.state === 'racing' || room.state === 'countdown') {
      // If all remaining players are already done, finish immediately.
      if (room.state === 'racing' && this.allPlayersFinished(room)) {
        this.endRace(roomId);
      }
      return;
    }
  }

  playerReadyToPlay(socket: GameSocket): void {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Public rooms don't support rematch — players should requeue via matchmaking.
    // Only block when the room is finished (rematch attempt), not during initial ready-up.
    if (room.isPublic && room.state === 'finished') {
      socket.emit('room:error', { message: 'Please requeue for a new match' });
      return;
    }

    const player = room.players.get(playerId);
    if (!player) return;
    player.readyToPlay = true;
    this.io.to(roomId).emit('room:player_ready', { playerId });

    // Check to see if all players are ready
    const playerCount = room.players.size;
    if (playerCount < MAX_PLAYERS_PER_ROOM) {
      return;
    }
    const allReady = Array.from(room.players.values()).every(p => p.readyToPlay);
    if (!allReady) {
      return;
    }
    
    // All players are ready - reset room, then start countdown
    this.resetRoom(socket);
    this.startCountdown(roomId);
  }

  private startCountdown(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Cancel waiting room timeout since race is starting
    this.cancelWaitingRoomTimeout(roomId);

    room.state = 'countdown';
    room.countdownStart = Date.now();

    console.log(`⏱️ Starting countdown for room ${roomId}`);

    // Countdown: 3, 2, 1, GO!
    let seconds = 3;
    
    const countdownInterval = setInterval(() => {
      this.io.to(roomId).emit('game:countdown', { seconds });
      seconds--;

      if (seconds < 0) {
        clearInterval(countdownInterval);
        this.startRace(roomId);
      }
    }, 1000);
  }

  private startRace(roomId: string): void {
    const room = this.rooms.get(roomId); //refetch source of truth
    if (!room) return;

    room.state = 'racing';
    const now = Date.now();
    room.startTime = now;

    room.players.forEach(player => {
      player.taskStartedAt = now;
    });

    console.log(`🏁 Race started in room ${roomId}`);
    this.io.to(roomId).emit('game:start', {
      startTime: room.startTime,
      initialTask: room.tasks[0],
      tasks: room.tasks,
      num_tasks: room.num_tasks,
    });
  }

  handleCursorMove(socket: GameSocket, offset: number): void {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'racing') return;
    const player = room.players.get(playerId);
    if (!player || player.isFinished) return;
    const currentTask = room.tasks[player.taskProgress];
    if (!currentTask || currentTask.type !== 'navigate') return;

    if (player.taskStartedAt && (Date.now() - player.taskStartedAt) < this.MIN_TASK_COMPLETION_MS) {
      return;
    }

    player.successIndicator.cursorOffset = offset;
    if (this.evaluateTaskCompletion(player, currentTask)) {
      this.advancePlayerTask(socket, room, player, roomId);
    }
  }

  handleEditorText(socket: GameSocket, text: string): void {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'racing') return;

    const player = room.players.get(playerId);
    if (!player || player.isFinished) return;
    
    const currentTask = room.tasks[player.taskProgress];
    if (!currentTask || currentTask.type !== 'delete') return;

    if (player.taskStartedAt && (Date.now() - player.taskStartedAt) < this.MIN_TASK_COMPLETION_MS) {
      return;
    }

    player.successIndicator.editorText = text;

    // Check if the task is completed
    if (this.evaluateTaskCompletion(player, currentTask)) {
      console.log('✅ [Backend] Task complete! Text matches expected result');
      this.advancePlayerTask(socket, room, player, roomId);
      return;
    }
    
    // Validate partial deletion: prefix and suffix must remain intact
    // Only the characters within targetRange should be deleted
    const { codeSnippet, targetRange } = currentTask;
    const prefix = codeSnippet.substring(0, targetRange.from);
    const suffix = codeSnippet.substring(targetRange.to);
    
    // Check if the text is a valid partial deletion
    const startsWithPrefix = text.startsWith(prefix);
    const endsWithSuffix = text.endsWith(suffix);
    const validLength = text.length >= prefix.length + suffix.length && text.length <= codeSnippet.length;
    
    const isValidPartial = startsWithPrefix && endsWithSuffix && validLength;
    
    console.log('🔍 [Backend] Validating partial deletion:', {
      textLength: text.length,
      originalLength: codeSnippet.length,
      targetRange,
      prefixLength: prefix.length,
      suffixLength: suffix.length,
      startsWithPrefix,
      endsWithSuffix,
      validLength,
      isValidPartial,
    });
    
    if (!isValidPartial) {
      // Invalid edit - something outside the target range was modified
      console.log('❌ [Backend] Invalid edit - resetting editor');
      socket.emit('game:validation_failed', playerId);
    } else {
      console.log('✅ [Backend] Valid partial deletion, continuing...');
    }
  }

  private advancePlayerTask(socket: GameSocket, room: GameRoom, player: Player, roomId: string): void {
    const playerId = player.id;
    player.taskProgress += 1;
    player.taskStartedAt = Date.now();

    player.successIndicator.editorText = '';
    
    // Send task progress and new task to the user
    socket.emit('game:player_finished_task', {
      playerId,
      taskProgress: player.taskProgress,
    });
    
    // Send the progress to the opponents
    this.io.to(roomId).emit('game:opponent_finished_task', {
      playerId,
      taskProgress: player.taskProgress,
    });
    
    // Return early if player not finished all tasks
    if (player.taskProgress < room.num_tasks) {
      return;
    }
   // Player finished all tasks 
    player.isFinished = true;
    player.finishTime = Date.now() - (room.startTime || 0);

    const finishedCount = Array.from(room.players.values()).filter(p => p.isFinished).length;
    console.log(`🎉 ${player.name} finished in position ${finishedCount}!`);

    this.io.to(roomId).emit('game:player_finished', {
      playerId,
      time: player.finishTime,
      position: finishedCount,
    });

    // Check if all players finished
    if (this.allPlayersFinished(room)) {
      this.endRace(roomId);
    }
  }

  private evaluateTaskCompletion(player: Player, currentTask: Task): boolean {
    switch (currentTask.type) {
      case 'navigate': {
        return player.successIndicator.cursorOffset === currentTask.targetOffset;
      }

      case 'delete': {
        return player.successIndicator.editorText === currentTask.expectedResult;
      }

      default: {
        console.log("Task type not defined", currentTask);
        return false;
      }
    }
  }

  private allPlayersFinished(room: GameRoom): boolean {
    return Array.from(room.players.values()).every(p => p.isFinished);
  }

  private endRace(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.state = 'finished';

    // Calculate rankings BEFORE resetting player states
    const rankings = Array.from(room.players.values())
      .filter(p => p.isFinished)
      .sort((a, b) => (a.finishTime || Infinity) - (b.finishTime || Infinity))
      .map((player, index) => ({
        playerId: player.id,
        playerName: player.name,
        time: player.finishTime || 0,
        position: index + 1,
      }));

    // Add players who didn't finish
    room.players.forEach(player => {
      if (!player.isFinished) {
        rankings.push({
          playerId: player.id,
          playerName: player.name,
          time: 0,
          position: rankings.length + 1,
        });
      }
    });

    console.log(`🏆 Race complete in room ${roomId} (${room.isPublic ? 'public' : 'private'}):`, rankings);
    this.io.to(roomId).emit('game:complete', { rankings });

    // For PUBLIC rooms (quick match): destroy after a short delay
    // Players should requeue via matchmaking for a new opponent
    if (room.isPublic) {
      console.log(`🎯 Public room ${roomId} - scheduling destruction`);
      const timer = setTimeout(() => {
        this.roomDestroyTimers.delete(roomId);
        console.log(`🗑️ Auto-destroying public room ${roomId}`);
        this.destroyRoom(roomId);
      }, 3000);
      this.roomDestroyTimers.set(roomId, timer);
      return;
    }

    // Remove players who left during/after the race before enabling rematch.
    room.players.forEach((player, id) => {
      if (player.leftRace) {
        room.players.delete(id);
      }
    });

    if (room.players.size === 0) {
      this.destroyRoom(roomId);
      return;
    }

    // For PRIVATE rooms: allow rematch, reset player states
    room.players.forEach(player => {
      player.successIndicator.cursorOffset = 0;
      player.successIndicator.editorText = '';
      player.taskProgress = 0;
      player.isFinished = false;
      player.readyToPlay = false;
      delete player.leftRace;
      delete player.taskStartedAt;
    });

    // Schedule room cleanup if players don't start a new game
    this.scheduleRoomCleanup(roomId);
  }

  private scheduleRoomCleanup(roomId: string): void {
    // Clear any existing timer for this room
    this.cancelRoomCleanup(roomId);

    const timer = setTimeout(() => {
      const room = this.rooms.get(roomId);
      if (room && room.state === 'finished') {
        console.log(`⏰ Room ${roomId} idle timeout - cleaning up`);
        this.destroyRoom(roomId);
      }
    }, this.ROOM_IDLE_TIMEOUT_MS);

    this.roomCleanupTimers.set(roomId, timer);
    console.log(`⏱️ Scheduled cleanup for room ${roomId} in ${this.ROOM_IDLE_TIMEOUT_MS / 1000}s`);
  }

  private cancelRoomCleanup(roomId: string): void {
    const timer = this.roomCleanupTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roomCleanupTimers.delete(roomId);
    }
  }

  private destroyRoom(roomId: string, reason?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log(`⚠️ Room ${roomId} not found for destruction`);
      return;
    }

    console.log(`🗑️ Destroying room ${roomId} (players: ${room.players.size}, state: ${room.state}, public: ${room.isPublic})`);

    // Notify players that room is being destroyed (if any still connected)
    if (room.players.size > 0) {
      const message = reason || (room.isPublic ? 'Match ended' : 'Room closed due to inactivity');
      this.io.to(roomId).emit('room:error', { message });
    }

    // Clean up player mappings
    room.players.forEach((player) => {
      this.playerRooms.delete(player.id);
    });

    // Clean up room and timers
    this.rooms.delete(roomId);
    this.cancelRoomCleanup(roomId);
    this.cancelWaitingRoomTimeout(roomId);

    const destroyTimer = this.roomDestroyTimers.get(roomId);
    if (destroyTimer) {
      clearTimeout(destroyTimer);
      this.roomDestroyTimers.delete(roomId);
    }

    console.log(`✅ Room ${roomId} destroyed. Remaining rooms: ${this.rooms.size}`);
  }

  resetRoom(socket: GameSocket): void {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    
    if (!roomId || !playerId) return;
    
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    // Only allow reset when game is finished
    if (room.state !== 'finished') {
      socket.emit('room:error', { message: 'Cannot reset: game not finished' });
      return;
    }

    // Cancel any pending cleanup since players want to play again
    this.cancelRoomCleanup(roomId);

    // Generate new tasks (half position + half delete)
    const tasksPerType = Math.floor(this.NUM_TASKS / 2);
    const positionTasks = generatePositionTasks(tasksPerType);
    const deleteTasks = generateDeleteTasks(tasksPerType);
    const finishedTask: Task = {
      id: '',
      type: 'navigate',
      description: '',
      codeSnippet: '',
      targetPosition: { line: 1, col: 0 },
      targetOffset: 0,
    };
    room.tasks = [...shuffle([...positionTasks, ...deleteTasks]), finishedTask];

    // Reset all player states
    room.players.forEach(player => {
      player.successIndicator = { cursorOffset: 0, editorText: '' };
      player.taskProgress = 0;
      player.isFinished = false;
      player.readyToPlay = false;
      delete player.finishTime;
      delete player.taskStartedAt;
    });

    // Reset room state
    room.state = 'waiting';
    delete room.startTime;
    delete room.countdownStart;

    console.log(`🔄 Room ${roomId} reset for new game`);

    // Notify all players that room has been reset
    this.io.to(roomId).emit('room:reset', { 
      players: this.getPlayersArray(room) 
    });
  }

  findOrCreateQuickMatchRoom(socket: GameSocket, playerName: string): { room: GameRoom; isNewRoom: boolean } | null {
    // Find a waiting PUBLIC room with space available (don't join private rooms)
    for (const [roomId, room] of this.rooms) {
      if (room.state === 'waiting' && room.players.size < MAX_PLAYERS_PER_ROOM && room.isPublic) {
        const joinedRoom = this.joinRoom(socket, roomId, playerName);
        if (joinedRoom) {
          console.log(`🎯 Quick match: ${playerName} joined existing room ${roomId}`);
          return { room: joinedRoom, isNewRoom: false };
        }
      }
    }
    
    // No available room found, create a new PUBLIC one
    console.log(`🏠 Quick match: Creating new public room for ${playerName}`);
    const newRoom = this.createRoom(socket, playerName, undefined, true);
    if (!newRoom) return null;
    return { room: newRoom, isNewRoom: true };
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  getPlayersArray(room: GameRoom): Player[] {
    return Array.from(room.players.values());
  }
}
