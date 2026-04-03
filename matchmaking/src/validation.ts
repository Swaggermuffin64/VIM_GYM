/**
 * Input Validation for Matchmaking Service
 */

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  error?: string;
}

const PLAYER_NAME_MAX_LENGTH = 20;
const PLAYER_NAME_MIN_LENGTH = 1;

/**
 * Sanitize and validate a player name.
 */
export function validatePlayerName(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { valid: true, value: 'Player' };
  }

  let name = input.trim().slice(0, PLAYER_NAME_MAX_LENGTH);

  // Remove dangerous characters
  name = name.replace(/[<>'"&\\]/g, '');
  // eslint-disable-next-line no-control-regex -- strip C0 / DEL control chars from user input
  name = name.replace(/[\x00-\x1F\x7F]/g, '');

  if (name.length < PLAYER_NAME_MIN_LENGTH) {
    name = 'Player';
  }

  return { valid: true, value: name };
}
