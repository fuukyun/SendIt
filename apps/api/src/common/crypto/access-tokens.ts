import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless proof that a recipient entered a link's password: `<transferId>.<expiry>.<hmac>`.
 * Scoped to one transfer, so a token for one link never opens another.
 */
export class AccessTokens {
  constructor(private readonly secret: string) {}

  issue(transferId: string, ttlSeconds: number, now = Date.now()): string {
    const payload = `${transferId}.${Math.floor(now / 1000) + ttlSeconds}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string, transferId: string, now = Date.now()): boolean {
    const [id, expiry, signature] = token.split('.');
    if (!id || !expiry || !signature || id !== transferId) return false;

    const expected = Buffer.from(this.sign(`${id}.${expiry}`), 'base64url');
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

    return Number(expiry) > Math.floor(now / 1000);
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(`download-access:${payload}`)
      .digest('base64url');
  }
}
