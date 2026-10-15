import type { CreateTransferResponse } from '@sendit/shared';
import { describe, expect, it, vi } from 'vitest';
import { StorageHttpError, uploadFile, type PutBlob, type UploadOptions } from './uploader';

const MiB = 1024 * 1024;

function file(size: number, name = 'photos.zip') {
  return Object.assign(new Blob([new Uint8Array(size)]), { name });
}

function created(upload: CreateTransferResponse['upload']): CreateTransferResponse {
  return {
    transferId: 't1',
    shareUrl: 'http://web/d/share',
    manageToken: 'manage',
    manageUrl: 'http://web/t/t1/manage#key=manage&share=share',
    expiresAt: '2030-01-01T00:00:00.000Z',
    file: { name: 'photos.zip', size: 0 },
    upload,
  };
}

function fakeApi(upload: CreateTransferResponse['upload']) {
  return {
    createTransfer: vi.fn().mockResolvedValue(created(upload)),
    requestPartUrls: vi.fn(async (_id: string, _token: string, numbers: number[]) => ({
      parts: numbers.map((n) => ({ partNumber: n, url: `https://s3/part/${n}` })),
    })),
    completeUpload: vi.fn().mockResolvedValue({ status: 'READY' }),
    deleteTransfer: vi.fn().mockResolvedValue(undefined),
  };
}

/** Reports full progress and answers with an ETag derived from the URL. */
const okPut: PutBlob = async ({ url, body, onProgress }) => {
  onProgress(body.size);
  return { etag: `"etag-${url.split('/').pop()}"` };
};

function run(overrides: Partial<UploadOptions> & Pick<UploadOptions, 'api' | 'file'>) {
  return uploadFile({
    put: okPut,
    settings: { expiresInDays: 3 },
    signal: new AbortController().signal,
    retryDelayMs: 1,
    ...overrides,
  });
}

describe('uploadFile', () => {
  it('uploads small files with one signed PUT', async () => {
    const api = fakeApi({
      method: 'single',
      url: 'https://s3/single',
      headers: { 'Content-Type': 'application/zip' },
    });
    const put = vi.fn(okPut);
    const progress: number[] = [];

    await run({ api, file: file(10), put, onProgress: (p) => progress.push(p.loaded) });

    expect(api.createTransfer).toHaveBeenCalledWith(
      { expiresInDays: 3, file: { name: 'photos.zip', size: 10 } },
      expect.any(AbortSignal),
    );
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://s3/single',
        headers: { 'Content-Type': 'application/zip' },
      }),
    );
    expect(api.completeUpload).toHaveBeenCalledWith('t1', 'manage', {}, expect.any(AbortSignal));
    expect(progress.at(-1)).toBe(10);
  });

  it('uploads parts in parallel and completes with every ETag in order', async () => {
    const size = 10 * MiB + 123;
    const api = fakeApi({ method: 'multipart', partSize: 5 * MiB, partCount: 3 });
    let active = 0;
    let maxActive = 0;
    const sizes = new Map<string, number>();
    const put: PutBlob = async (req) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      sizes.set(req.url, req.body.size);
      active--;
      return okPut(req);
    };
    const progress: number[] = [];

    await run({
      api,
      file: file(size),
      put,
      concurrency: 2,
      onProgress: (p) => progress.push(p.loaded),
    });

    expect(maxActive).toBe(2);
    expect([...sizes.entries()].sort()).toEqual([
      ['https://s3/part/1', 5 * MiB],
      ['https://s3/part/2', 5 * MiB],
      ['https://s3/part/3', 123],
    ]);
    expect(api.completeUpload).toHaveBeenCalledWith(
      't1',
      'manage',
      {
        parts: [
          { partNumber: 1, etag: '"etag-1"' },
          { partNumber: 2, etag: '"etag-2"' },
          { partNumber: 3, etag: '"etag-3"' },
        ],
      },
      expect.any(AbortSignal),
    );
    expect(progress.at(-1)).toBe(size);
  });

  it('requests part URLs in batches of 100', async () => {
    const api = fakeApi({ method: 'multipart', partSize: 1, partCount: 250 });
    await run({ api, file: file(250) });
    expect(api.requestPartUrls.mock.calls.map((c) => [c[2][0], c[2].length])).toEqual([
      [1, 100],
      [101, 100],
      [201, 50],
    ]);
  });

  it('retries a failed part with a fresh URL', async () => {
    const api = fakeApi({ method: 'multipart', partSize: 5, partCount: 2 });
    let failures = 0;
    const put: PutBlob = async (req) => {
      if (req.url.endsWith('/2') && failures++ < 2) throw new StorageHttpError(503);
      return okPut(req);
    };

    await run({ api, file: file(10), put });

    expect(failures).toBe(3);
    // One initial batch, then one refetch per retry of part 2.
    expect(api.requestPartUrls).toHaveBeenCalledTimes(3);
    expect(api.completeUpload).toHaveBeenCalled();
  });

  it('gives up on client errors, stops the other parts and deletes the transfer', async () => {
    const api = fakeApi({ method: 'multipart', partSize: 5, partCount: 4 });
    const aborted: string[] = [];
    const put: PutBlob = (req) =>
      new Promise((resolve, reject) => {
        if (req.url.endsWith('/1')) {
          reject(new StorageHttpError(400));
          return;
        }
        req.signal.addEventListener('abort', () => {
          aborted.push(req.url);
          reject(req.signal.reason);
        });
        setTimeout(() => resolve({ etag: 'x' }), 1000);
      });

    await expect(run({ api, file: file(20), put, concurrency: 4 })).rejects.toBeInstanceOf(
      StorageHttpError,
    );
    expect(aborted.length).toBeGreaterThan(0);
    expect(api.completeUpload).not.toHaveBeenCalled();
    expect(api.deleteTransfer).toHaveBeenCalledWith('t1', 'manage');
  });

  it('fails clearly when storage hides the ETag header', async () => {
    const api = fakeApi({ method: 'multipart', partSize: 5, partCount: 1 });
    const put: PutBlob = async () => ({ etag: null });
    await expect(run({ api, file: file(5), put })).rejects.toThrow('ETag');
  });

  it('cancels and cleans up when the caller aborts', async () => {
    const api = fakeApi({ method: 'single', url: 'https://s3/single', headers: {} });
    const controller = new AbortController();
    const put: PutBlob = (req) =>
      new Promise((_, reject) => {
        req.signal.addEventListener('abort', () => reject(req.signal.reason));
        setTimeout(() => controller.abort(new Error('cancelled')), 5);
      });

    await expect(run({ api, file: file(5), put, signal: controller.signal })).rejects.toThrow(
      'cancelled',
    );
    expect(api.deleteTransfer).toHaveBeenCalled();
  });
});
