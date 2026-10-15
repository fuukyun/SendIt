import { describe, expect, it } from 'vitest';
import { generateToken, hashToken, tokenMatchesHash } from './tokens.js';

describe('tokens', () => {
  it('generates unique 256-bit URL-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));
    expect(tokens.size).toBe(1000);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    }
  });

  it('matches a token against its hash only', () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenMatchesHash(token, hash)).toBe(true);
    expect(tokenMatchesHash(generateToken(), hash)).toBe(false);
    expect(tokenMatchesHash(token, 'not-a-hash')).toBe(false);
  });
});
