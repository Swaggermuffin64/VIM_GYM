import { describe, expect, it } from 'vitest';
import { originFromEnv } from './config.js';

describe('originFromEnv', () => {
  it('falls back when the env var is unset or blank', () => {
    expect(originFromEnv(undefined, 'https://vimgym.app')).toBe(
      'https://vimgym.app'
    );
    expect(originFromEnv('   ', 'https://vimgym.app')).toBe(
      'https://vimgym.app'
    );
  });

  it('strips trailing slashes so appended paths never double up', () => {
    expect(originFromEnv('https://www.vimgym.app/', 'x')).toBe(
      'https://www.vimgym.app'
    );
    expect(originFromEnv(' https://tunnel.example// ', 'x')).toBe(
      'https://tunnel.example'
    );
  });
});
