import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMITS } from '../../src/security/rate-limits.js';
import { createTestApp, type TestContext } from './helpers.js';

const UNKNOWN_TOKEN = 'A'.repeat(43);

describe('security (integration)', () => {
  let ctx: TestContext;
  const api = () => request(ctx.app.getHttpServer());

  beforeAll(() => {
    process.env.RATE_LIMIT_ENABLED = 'true';
  });

  afterAll(() => {
    process.env.RATE_LIMIT_ENABLED = 'false';
  });

  // A fresh app per test starts with empty in-memory rate-limit counters.
  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx?.app.close();
  });

  /** Sends `count` requests one after another and returns their status codes. */
  async function statuses(count: number, send: () => request.Test): Promise<number[]> {
    const result: number[] = [];
    for (let i = 0; i < count; i++) result.push((await send()).status);
    return result;
  }

  describe('rate limits', () => {
    it('limits password attempts per client and blocks for 15 minutes', async () => {
      const { limit } = RATE_LIMITS.UNLOCK;
      const unlock = () => api().post(`/api/d/${UNKNOWN_TOKEN}/unlock`).send({ password: 'x' });

      const codes = await statuses(limit, unlock);
      expect(codes.every((c) => c === 404)).toBe(true);

      const blocked = await unlock().expect(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(14 * 60);
    });

    it('limits transfer creation', async () => {
      const { limit } = RATE_LIMITS.CREATE_TRANSFER;
      // Invalid bodies still count, without creating anything.
      const create = () => api().post('/api/transfers').send({});

      expect(new Set(await statuses(limit, create))).toEqual(new Set([400]));
      await create().expect(429);
    });

    it('limits download URL requests', async () => {
      const { limit } = RATE_LIMITS.DOWNLOAD_URL;
      const download = () => api().post(`/api/d/${UNKNOWN_TOKEN}/url`).send();

      await statuses(limit, download);
      await download().expect(429);
    });

    it('ignores a spoofed X-Forwarded-For', async () => {
      const download = (ip: string) =>
        api().post(`/api/d/${UNKNOWN_TOKEN}/url`).set('X-Forwarded-For', ip).send();

      for (let i = 0; i < RATE_LIMITS.DOWNLOAD_URL.limit; i++) await download(`10.0.0.${i}`);
      await download('10.0.1.1').expect(429);
    });

    it('never limits the health check', async () => {
      const codes = await statuses(RATE_LIMITS.DEFAULT.limit + 5, () => api().get('/api/health'));
      expect(new Set(codes)).toEqual(new Set([200]));
    });
  });

  describe('HTTP hardening', () => {
    it('sends security headers and hides the framework', async () => {
      const res = await api().get('/api/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('only allows the web origin cross-origin', async () => {
      const allowed = await api().get('/api/health').set('Origin', 'http://localhost:3000');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');

      const other = await api().get('/api/health').set('Origin', 'https://evil.example');
      expect(other.headers['access-control-allow-origin']).not.toBe('https://evil.example');
    });

    it('rejects oversized request bodies', async () => {
      const huge = { file: { name: 'a.zip', size: 1 }, message: 'x'.repeat(2 * 1024 * 1024) };
      const res = await api().post('/api/transfers').send(huge).expect(413);
      expect(res.body).toEqual({ statusCode: 413, message: 'Request body too large' });
    });

    it('rejects malformed JSON as a client error', async () => {
      const res = await api()
        .post('/api/transfers')
        .set('Content-Type', 'application/json')
        .send('{"file":')
        .expect(400);
      expect(res.body).toEqual({ statusCode: 400, message: 'Malformed request body' });
    });
  });
});
