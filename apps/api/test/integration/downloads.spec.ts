import type {
  CreateTransferResponse,
  DownloadUrlResponse,
  UnlockTransferResponse,
} from '@sendit/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, putToUrl, resetDatabase, type TestContext } from './helpers.js';

interface ReadyTransfer {
  transfer: CreateTransferResponse;
  shareToken: string;
  content: Uint8Array;
}

describe('downloads (integration)', () => {
  let ctx: TestContext;
  const api = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  /** Uploads through the real flow; completing it publishes the file. */
  async function createReadyTransfer(
    options: { password?: string; maxDownloads?: number } = {},
    name = 'photos.zip',
  ): Promise<ReadyTransfer> {
    const content = new TextEncoder().encode('any file content');
    const res = await api()
      .post('/api/transfers')
      .send({ ...options, file: { name, size: content.length } })
      .expect(201);
    const transfer = res.body as CreateTransferResponse;
    if (transfer.upload.method !== 'single') throw new Error('expected single upload');

    await putToUrl(transfer.upload.url, content, transfer.upload.headers);
    await api()
      .post(`/api/transfers/${transfer.transferId}/complete`)
      .set('Authorization', `Bearer ${transfer.manageToken}`)
      .send({})
      .expect(200);

    return { transfer, shareToken: transfer.shareUrl.split('/').pop()!, content };
  }

  function requestUrl(shareToken: string, accessToken?: string) {
    const req = api().post(`/api/d/${shareToken}/url`);
    if (accessToken) req.set('Authorization', `Bearer ${accessToken}`);
    return req.send();
  }

  function setTransfer(transfer: CreateTransferResponse, data: object) {
    return ctx.prisma.transfer.update({ where: { id: transfer.transferId }, data });
  }

  describe('public link', () => {
    it('shows the file and serves it straight from storage', async () => {
      const { shareToken, content } = await createReadyTransfer(
        { maxDownloads: 5 },
        'Báo cáo "Q3".zip',
      );

      const info = await api().get(`/api/d/${shareToken}`).expect(200);
      expect(info.body).toMatchObject({
        requiresPassword: false,
        downloadsRemaining: 5,
        file: { name: 'Báo cáo _Q3_.zip', size: content.length },
      });

      const res = await requestUrl(shareToken).expect(200);
      const { url, expiresIn } = res.body as DownloadUrlResponse;
      expect(expiresIn).toBe(60);
      expect(new URL(url).origin).toBe(process.env.S3_ENDPOINT);

      const download = await fetch(url);
      expect(download.status).toBe(200);
      expect(new Uint8Array(await download.arrayBuffer())).toEqual(content);
      expect(download.headers.get('content-type')).toBe('application/octet-stream');
      expect(download.headers.get('content-disposition')).toBe(
        `attachment; filename="B_o c_o _Q3_.zip"; filename*=UTF-8''B%C3%A1o%20c%C3%A1o%20_Q3_.zip`,
      );
    });

    it('records downloads without storing the client address', async () => {
      const { shareToken } = await createReadyTransfer();
      await requestUrl(shareToken).set('User-Agent', 'test-agent').expect(200);

      const events = await ctx.prisma.downloadEvent.findMany();
      expect(events).toHaveLength(1);
      expect(events[0]!.userAgent).toBe('test-agent');
      expect(events[0]!.ipHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('availability', () => {
    it.each([
      ['malformed', 'abc'],
      ['unknown', 'A'.repeat(43)],
    ])('answers 404 for a %s token', async (_, token) => {
      await api().get(`/api/d/${token}`).expect(404);
    });

    it('answers 404 once the link expired', async () => {
      const { transfer, shareToken } = await createReadyTransfer();
      await setTransfer(transfer, { expiresAt: new Date(Date.now() - 1000) });

      const res = await api().get(`/api/d/${shareToken}`).expect(404);
      await requestUrl(shareToken).expect(404);
      // Same message as an unknown link.
      expect(res.body.message).toBe('Link not found or no longer available');
    });

    it.each(['UPLOADING', 'REJECTED', 'EXPIRED', 'DELETED'])(
      'answers 404 while the transfer is %s',
      async (status) => {
        const { transfer, shareToken } = await createReadyTransfer();
        await setTransfer(transfer, { status });
        await api().get(`/api/d/${shareToken}`).expect(404);
        await requestUrl(shareToken).expect(404);
      },
    );
  });

  describe('download limit', () => {
    it('stops issuing URLs once the limit is reached', async () => {
      const { shareToken } = await createReadyTransfer({ maxDownloads: 2 });

      await requestUrl(shareToken).expect(200);
      const info = await api().get(`/api/d/${shareToken}`).expect(200);
      expect(info.body.downloadsRemaining).toBe(1);
      await requestUrl(shareToken).expect(200);

      await requestUrl(shareToken).expect(404);
      await api().get(`/api/d/${shareToken}`).expect(404);
    });

    it('never exceeds the limit under concurrent requests', async () => {
      const { transfer, shareToken } = await createReadyTransfer({ maxDownloads: 3 });
      const results = await Promise.all(Array.from({ length: 15 }, () => requestUrl(shareToken)));

      expect(results.filter((r) => r.status === 200)).toHaveLength(3);
      expect(results.filter((r) => r.status === 404)).toHaveLength(12);
      const row = await ctx.prisma.transfer.findUniqueOrThrow({
        where: { id: transfer.transferId },
      });
      expect(row.downloadCount).toBe(3);
    });
  });

  describe('password', () => {
    const password = 'correct horse';

    function unlock(shareToken: string, pw: string) {
      return api().post(`/api/d/${shareToken}/unlock`).send({ password: pw });
    }

    it('hides the file until unlocked', async () => {
      const { shareToken } = await createReadyTransfer({ password });

      const locked = await api().get(`/api/d/${shareToken}`).expect(200);
      expect(locked.body).toEqual({ requiresPassword: true });
      await requestUrl(shareToken).expect(401);

      await unlock(shareToken, 'wrong password').expect(401);
      const res = await unlock(shareToken, password).expect(200);
      const { accessToken, expiresIn } = res.body as UnlockTransferResponse;
      expect(expiresIn).toBe(1800);

      const info = await api()
        .get(`/api/d/${shareToken}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(info.body.file.name).toBe('photos.zip');
      await requestUrl(shareToken, accessToken).expect(200);
    });

    it("does not accept another link's access token", async () => {
      const a = await createReadyTransfer({ password });
      const b = await createReadyTransfer({ password });
      const { accessToken } = (await unlock(a.shareToken, password).expect(200)).body;

      await requestUrl(b.shareToken, accessToken).expect(401);
      const info = await api()
        .get(`/api/d/${b.shareToken}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(info.body).toEqual({ requiresPassword: true });
    });

    it('locks the link after 5 wrong passwords, even for the right one', async () => {
      const { shareToken } = await createReadyTransfer({ password });
      for (let i = 0; i < 5; i++) await unlock(shareToken, 'wrong').expect(401);

      const res = await unlock(shareToken, password).expect(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(800);
    });

    it('bounds guesses made in parallel', async () => {
      const { shareToken } = await createReadyTransfer({ password });
      const results = await Promise.all(
        Array.from({ length: 20 }, () => unlock(shareToken, 'wrong')),
      );
      expect(results.filter((r) => r.status === 401).length).toBeLessThanOrEqual(5);
      expect(results.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(15);
    });

    it('resets the failure count after a successful unlock', async () => {
      const { shareToken } = await createReadyTransfer({ password });
      for (let i = 0; i < 4; i++) await unlock(shareToken, 'wrong').expect(401);
      await unlock(shareToken, password).expect(200);
      for (let i = 0; i < 4; i++) await unlock(shareToken, 'wrong').expect(401);
      await unlock(shareToken, password).expect(200);
    });
  });
});
