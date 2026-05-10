export type KeystrokeSource = 'practice' | 'multiplayer';

export interface KeystrokeEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  dtMs: number;
}

export interface TaskKeystrokeSubmission {
  source: KeystrokeSource;
  taskId: string;
  taskType: 'navigate' | 'delete' | 'yank_paste';
  startedAt: number;
  completedAt: number;
  roomId?: string;
  playerId?: string;
  events: KeystrokeEvent[];
}
