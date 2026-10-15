import {
  parseManageFragment,
  type CreateTransferResponse,
  type PartUrlsResponse,
} from '@sendit/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bytes, createTestApp, putToUrl, resetDatabase, type TestContext } from './helpers.js';

const MiB = 1024 * 1024;

describe('transfers (integration)', () => {
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

  async function createTransfer(body: object): Promise<CreateTransferResponse> {
    const res = await api().post('/api/transfers').send(body).expect(201);
    return res.body as CreateTransferResponse;
  }

  function complete(t: CreateTransferResponse, body: object = {}) {
    return api()
      .post(`/api/transfers/${t.transferId}/complete`)
      .set('Authorization', `Bearer ${t.manageToken}`)
      .send(body);
  }

  function singleUpload(t: CreateTransferResponse) {
    if (t.upload.method !== 'single') throw new Error('expected single upload');
    return t.upload;
  }

  describe('single PUT upload', () => {
    it('uploads directly to storage and completes', async () => {
      const t = await createTransfer({
        file: { name: '../photos.zip', size: 11 },
        password: 'secret123',
        maxDownloads: 3,
        expiresInDays: 2,
      });

      expect(t.shareUrl).toMatch(/^http:\/\/localhost:3000\/d\/[A-Za-z0-9_-]{43}$/);
      expect(t.file).toEqual({ name: 'photos.zip', size: 11 });
      const upload = singleUpload(t);
      expect(upload.headers).toEqual({ 'Content-Type': 'application/octet-stream' });
      expect(new URL(upload.url).origin).toBe(process.env.S3_ENDPOINT);

      const put = await putToUrl(upload.url, bytes(11), upload.headers);
      expect(put.status).toBe(200);

      const res = await complete(t).expect(200);
      // Published straight away: no type check or scan in between.
      expect(res.body).toEqual({ status: 'READY' });
      await api()
        .get(`/api/d/${t.shareUrl.split('/').pop()}`)
        .expect(200);
    });

    it.each(['setup.exe', 'run.bat', 'page.html', 'README', 'archive.tar.gz', '.env'])(
      'accepts any file type, such as %s',
      async (name) => {
        const t = await createTransfer({ file: { name, size: 1 } });
        expect(t.file.name).toBe(name);
        // Stored as opaque bytes whatever the name, so it is never rendered by the browser.
        expect(singleUpload(t).headers).toEqual({ 'Content-Type': 'application/octet-stream' });
      },
    );

    it('stores only hashes of tokens and passwords', async () => {
      const t = await createTransfer({ file: { name: 'a.zip', size: 1 }, password: 'secret123' });
      const shareToken = t.shareUrl.split('/').pop()!;
      const row = await ctx.prisma.transfer.findUniqueOrThrow({ where: { id: t.transferId } });

      const serialized = JSON.stringify(row, (_, v) => (typeof v === 'bigint' ? String(v) : v));
      expect(serialized).not.toContain(shareToken);
      expect(serialized).not.toContain(t.manageToken);
      expect(serialized).not.toContain('secret123');
      expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('is rejected by storage when the body size differs from the declared size', async () => {
      const t = await createTransfer({ file: { name: 'a.zip', size: 10 } });
      const upload = singleUpload(t);
      const put = await putToUrl(upload.url, bytes(11), upload.headers);
      expect(put.ok).toBe(false);
    });

    it('is rejected by storage when the content type differs', async () => {
      const t = await createTransfer({ file: { name: 'a.zip', size: 4 } });
      const put = await putToUrl(singleUpload(t).url, bytes(4), { 'Content-Type': 'text/html' });
      expect(put.ok).toBe(false);
    });

    it('refuses to complete before the file was uploaded', async () => {
      const t = await createTransfer({ file: { name: 'a.zip', size: 4 } });
      const res = await complete(t).expect(400);
      expect(res.body.message).toBe('File has not been uploaded');
    });

    it('answers repeated and concurrent completions with the current state', async () => {
      const t = await createTransfer({ file: { name: 'a.zip', size: 4 } });
      const upload = singleUpload(t);
      await putToUrl(upload.url, bytes(4), upload.headers);

      const results = await Promise.all([complete(t), complete(t), complete(t)]);
      for (const res of results) expect(res.body).toEqual({ status: 'READY' });
      const again = await complete(t).expect(200);
      expect(again.body).toEqual({ status: 'READY' });
    });
  });

  describe('multipart upload', () => {
    const size = 11 * MiB; // 3 parts with the 5 MiB test part size

    function requestParts(t: CreateTransferResponse, partNumbers: number[]) {
      return api()
        .post(`/api/transfers/${t.transferId}/parts`)
        .set('Authorization', `Bearer ${t.manageToken}`)
        .send({ partNumbers });
    }

    async function uploadParts(t: CreateTransferResponse, content: Uint8Array) {
      const res = await requestParts(t, [1, 2, 3]).expect(200);
      const { parts } = res.body as PartUrlsResponse;

      return Promise.all(
        parts.map(async ({ partNumber, url }) => {
          const start = (partNumber - 1) * 5 * MiB;
          const put = await putToUrl(url, content.subarray(start, start + 5 * MiB));
          expect(put.status).toBe(200);
          return { partNumber, etag: put.headers.get('etag')! };
        }),
      );
    }

    it('uploads parts directly to storage and assembles them', async () => {
      const t = await createTransfer({ file: { name: 'big.7z', size } });
      expect(t.upload).toEqual({ method: 'multipart', partSize: 5 * MiB, partCount: 3 });

      const parts = await uploadParts(t, bytes(size));
      const res = await complete(t, { parts }).expect(200);
      expect(res.body).toEqual({ status: 'READY' });

      const row = await ctx.prisma.transfer.findUniqueOrThrow({ where: { id: t.transferId } });
      expect(await ctx.storage.headObject(row.storageKey)).toEqual({ size });
    });

    it('requires every part to complete', async () => {
      const t = await createTransfer({ file: { name: 'big.7z', size } });
      const parts = await uploadParts(t, bytes(size));
      const res = await complete(t, { parts: parts.slice(0, 2) }).expect(400);
      expect(res.body.message).toBe('Expected ETags for parts 1..3');
    });

    it('is rejected by storage when a part has the wrong size', async () => {
      const t = await createTransfer({ file: { name: 'big.7z', size } });
      const res = await requestParts(t, [3]).expect(200); // the last part is 1 MiB
      const put = await putToUrl((res.body as PartUrlsResponse).parts[0]!.url, bytes(2 * MiB));
      expect(put.ok).toBe(false);
    });

    it('rejects part numbers beyond the part count', async () => {
      const t = await createTransfer({ file: { name: 'big.7z', size } });
      await requestParts(t, [4]).expect(400);
    });

    it('does not hand out part URLs for single-PUT uploads', async () => {
      const t = await createTransfer({ file: { name: 'small.zip', size: 4 } });
      await requestParts(t, [1]).expect(400);
    });
  });

  describe('owner view', () => {
    it('links to a manage page carrying both tokens in the fragment', async () => {
      const t = await createTransfer({ file: { name: 'a.zip', size: 4 } });
      const url = new URL(t.manageUrl);
      expect(url.pathname).toBe(`/t/${t.transferId}/manage`);
      expect(parseManageFragment(url.hash)).toEqual({
        manageToken: t.manageToken,
        shareToken: t.shareUrl.split('/').pop(),
      });
    });

    it('shows the owner the transfer status', async () => {
      const t = await createTransfer({
        file: { name: 'a.zip', size: 4 },
        maxDownloads: 3,
        title: 'Ảnh cưới',
      });
      const res = await api()
        .get(`/api/transfers/${t.transferId}`)
        .set('Authorization', `Bearer ${t.manageToken}`)
        .expect(200);
      expect(res.body).toMatchObject({
        transferId: t.transferId,
        status: 'UPLOADING',
        title: 'Ảnh cưới',
        downloadCount: 0,
        maxDownloads: 3,
        expiresAt: t.expiresAt,
        file: { name: 'a.zip', size: 4 },
      });
      await api().get(`/api/transfers/${t.transferId}`).expect(401);
    });
  });

  describe('authorization', () => {
    it('requires the manage token', async () => {
      const t = await createTransfer({ file: { name: 'a.zip', size: 4 } });
      const url = `/api/transfers/${t.transferId}/complete`;

      await api().post(url).send({}).expect(401);
      await api().post(url).set('Authorization', 'Bearer wrong').send({}).expect(404);
      await api()
        .post('/api/transfers/not-a-uuid/complete')
        .set('Authorization', `Bearer ${t.manageToken}`)
        .send({})
        .expect(404);
    });

    it("cannot use one transfer's token on another", async () => {
      const mine = await createTransfer({ file: { name: 'a.zip', size: 4 } });
      const theirs = await createTransfer({ file: { name: 'b.zip', size: 4 } });
      await api()
        .post(`/api/transfers/${theirs.transferId}/complete`)
        .set('Authorization', `Bearer ${mine.manageToken}`)
        .send({})
        .expect(404);
    });
  });

  describe('validation', () => {
    it.each([
      ['a missing file', {}],
      ['an empty name', { file: { name: '  ', size: 1 } }],
      ['a file over 2 GiB', { file: { name: 'a.zip', size: 2 * 1024 * MiB + 1 } }],
      ['a zero-byte file', { file: { name: 'a.zip', size: 0 } }],
      ['an expiry over 7 days', { file: { name: 'a.zip', size: 1 }, expiresInDays: 8 }],
      ['a short password', { file: { name: 'a.zip', size: 1 }, password: '123' }],
    ])('rejects %s', async (_, body) => {
      const res = await api().post('/api/transfers').send(body).expect(400);
      expect(res.body.message).toBe('Validation failed');
    });

    it('says which field is wrong', async () => {
      const res = await api()
        .post('/api/transfers')
        .send({ file: { name: 'a.zip', size: 0 } })
        .expect(400);
      expect(res.body.errors).toEqual([{ path: 'file.size', message: expect.any(String) }]);
    });
  });
});
