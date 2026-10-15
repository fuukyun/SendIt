import { describe, expect, it } from 'vitest';
import { AccessTokens } from './access-tokens.js';

const tokens = new AccessTokens('test-secret-test-secret-test-secret');
const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
const otherId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('AccessTokens', () => {
  it('accepts a fresh token for its own transfer', () => {
    expect(tokens.verify(tokens.issue(id, 60), id)).toBe(true);
  });

  it('rejects a token for another transfer', () => {
    const token = tokens.issue(id, 60);
    expect(tokens.verify(token, otherId)).toBe(false);
    // Swapping the id in the payload breaks the signature.
    expect(tokens.verify(token.replace(id, otherId), otherId)).toBe(false);
  });

  it('rejects expired tokens', () => {
    const now = Date.now();
    const token = tokens.issue(id, 60, now);
    expect(tokens.verify(token, id, now + 59_000)).toBe(true);
    expect(tokens.verify(token, id, now + 60_000)).toBe(false);
  });

  it('rejects tampered or malformed tokens', () => {
    const [tid, expiry, signature] = tokens.issue(id, 60).split('.');
    expect(tokens.verify(`${tid}.${Number(expiry) + 3600}.${signature}`, id)).toBe(false);
    expect(tokens.verify('garbage', id)).toBe(false);
    expect(tokens.verify(`${id}.1.`, id)).toBe(false);
  });

  it('rejects tokens signed with another secret', () => {
    const forged = new AccessTokens('another-secret-another-secret-xx').issue(id, 60);
    expect(tokens.verify(forged, id)).toBe(false);
  });
});
