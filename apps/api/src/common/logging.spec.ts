import { describe, expect, it } from 'vitest';
import { redactPath } from './logging.js';

describe('redactPath', () => {
  const token = 'A'.repeat(43);

  it.each([
    [`/api/d/${token}`, '/api/d/:token'],
    [`/api/d/${token}/unlock`, '/api/d/:token/unlock'],
    [`/api/d/${token}/url?x=1`, '/api/d/:token/url'],
    ['/api/transfers/123/complete?secret=1', '/api/transfers/123/complete'],
    ['/api/health', '/api/health'],
  ])('%s -> %s', (input, expected) => {
    expect(redactPath(input)).toBe(expected);
  });
});
