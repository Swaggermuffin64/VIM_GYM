import { describe, it, expect } from 'vitest';
import {
  isAuthorizedForHealthMetrics,
  HEALTH_METRICS_HEADER,
} from './healthMetrics.js';

const TOKEN = 'super-secret-health-token';

describe('isAuthorizedForHealthMetrics', () => {
  it('authorizes a request whose header matches the configured token', () => {
    expect(
      isAuthorizedForHealthMetrics({ [HEALTH_METRICS_HEADER]: TOKEN }, TOKEN)
    ).toBe(true);
  });

  it('rejects a request with a wrong token', () => {
    expect(
      isAuthorizedForHealthMetrics({ [HEALTH_METRICS_HEADER]: 'wrong' }, TOKEN)
    ).toBe(false);
  });

  it('rejects a request with no token header', () => {
    expect(isAuthorizedForHealthMetrics({}, TOKEN)).toBe(false);
  });

  it('fails closed when no token is configured', () => {
    expect(
      isAuthorizedForHealthMetrics(
        { [HEALTH_METRICS_HEADER]: TOKEN },
        undefined
      )
    ).toBe(false);
    expect(isAuthorizedForHealthMetrics({}, undefined)).toBe(false);
  });

  it('fails closed when configured token is an empty string', () => {
    expect(
      isAuthorizedForHealthMetrics({ [HEALTH_METRICS_HEADER]: '' }, '')
    ).toBe(false);
  });

  it('uses the first value when the header is sent multiple times', () => {
    expect(
      isAuthorizedForHealthMetrics(
        { [HEALTH_METRICS_HEADER]: [TOKEN, 'other'] },
        TOKEN
      )
    ).toBe(true);
    expect(
      isAuthorizedForHealthMetrics(
        { [HEALTH_METRICS_HEADER]: ['other', TOKEN] },
        TOKEN
      )
    ).toBe(false);
  });
});
