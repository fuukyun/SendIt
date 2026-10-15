import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bytes,
  createTestApp,
  resetDatabase,
  uploadFile,
  type TestContext,
  type UploadedTransfer,
} from './helpers.js';

const MINUTE = 60 * 1000;

describe('cleanup (integration)', () => {
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

  function readyTransfer(options = {}): Promise<UploadedTransfer> {
    return uploadFile(ctx, 'a.bin', bytes(16), options);
  }

  /** Raw SQL, so `updated_at` can be backdated (Prisma would overwrite it). */
  async function backdate(u: UploadedTransfer, column: string, msAgo: number) {
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE transfers SET ${column} = $1 WHERE id = $2::uuid`,
      new Date(Date.now() - msAgo),
      u.transfer.transferId,
    );
  }

  function setColumns(u: UploadedTransfer, data: object) {
    return ctx.prisma.transfer.update({ where: { id: u.transfer.transferId }, data });
  }

  async function state(u: UploadedTransfer) {
    const row = await ctx.prisma.transfer.findUniqueOrThrow({
      where: { id: u.transfer.transferId },
    });
    return { status: row.status, stored: (await ctx.storage.headObject(row.storageKey)) !== null };
  }

  it('deletes expired files', async () => {
    const expired = await readyTransfer();
    const active = await readyTransfer();
    await setColumns(expired, { expiresAt: new Date(Date.now() - MINUTE) });

    const result = await ctx.cleanup.sweep();

    expect(result.expired).toBe(1);
    expect(await state(expired)).toEqual({ status: 'EXPIRED', stored: false });
    expect(await state(active)).toEqual({ status: 'READY', stored: true });
  });

  it('deletes files whose downloads are used up, after the last URL has expired', async () => {
    const usedUp = await readyTransfer({ maxDownloads: 1 });
    await api().post(`/api/d/${usedUp.shareToken}/url`).expect(200);

    // The URL just handed out is still valid for 60 s.
    expect((await ctx.cleanup.sweep()).exhausted).toBe(0);
    expect(await state(usedUp)).toEqual({ status: 'READY', stored: true });

    await backdate(usedUp, 'updated_at', 5 * MINUTE);
    expect((await ctx.cleanup.sweep()).exhausted).toBe(1);
    expect(await state(usedUp)).toEqual({ status: 'EXPIRED', stored: false });
  });

  it('keeps files with downloads left', async () => {
    const t = await readyTransfer({ maxDownloads: 2 });
    await api().post(`/api/d/${t.shareToken}/url`).expect(200);
    await backdate(t, 'updated_at', 5 * MINUTE);

    expect((await ctx.cleanup.sweep()).exhausted).toBe(0);
    expect(await state(t)).toEqual({ status: 'READY', stored: true });
  });

  it('drops uploads abandoned for a day', async () => {
    const res = await api()
      .post('/api/transfers')
      .send({ file: { name: 'never-finished.zip', size: 10 } })
      .expect(201);
    const abandoned: UploadedTransfer = { transfer: res.body, shareToken: '' };
    await backdate(abandoned, 'created_at', 25 * 60 * MINUTE);

    expect((await ctx.cleanup.sweep()).abandoned).toBe(1);
    expect((await state(abandoned)).status).toBe('EXPIRED');
  });

  it('sweeps on its own when the API starts and then on a timer', async () => {
    const expired = await readyTransfer();
    await setColumns(expired, { expiresAt: new Date(Date.now() - MINUTE) });

    process.env.CLEANUP_INTERVAL_SECONDS = '1';
    const scheduled = await createTestApp();
    try {
      await expect
        .poll(() => state(expired), { timeout: 5000 })
        .toEqual({
          status: 'EXPIRED',
          stored: false,
        });
    } finally {
      process.env.CLEANUP_INTERVAL_SECONDS = '0';
      await scheduled.app.close();
    }
  });

  it('lets the owner delete a transfer at any time', async () => {
    const t = await readyTransfer();
    await api()
      .delete(`/api/transfers/${t.transfer.transferId}`)
      .set('Authorization', `Bearer ${t.transfer.manageToken}`)
      .expect(204);

    expect(await state(t)).toEqual({ status: 'DELETED', stored: false });
    await api().get(`/api/d/${t.shareToken}`).expect(404);
    // Idempotent.
    await api()
      .delete(`/api/transfers/${t.transfer.transferId}`)
      .set('Authorization', `Bearer ${t.transfer.manageToken}`)
      .expect(204);
  });
});
