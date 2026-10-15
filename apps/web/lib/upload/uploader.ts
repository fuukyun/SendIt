import type { CompleteUploadInput, CreateTransferResponse } from '@sendit/shared';
import type { Api, CreateTransferRequest } from '../api';

/** Uploads a body to a pre-signed URL. Implemented with XHR in the browser for progress events. */
export type PutBlob = (request: {
  url: string;
  body: Blob;
  headers?: Record<string, string>;
  signal: AbortSignal;
  onProgress: (loadedBytes: number) => void;
}) => Promise<{ etag: string | null }>;

/** Thrown by a PutBlob implementation for a non-2xx answer from storage. */
export class StorageHttpError extends Error {
  constructor(readonly status: number) {
    super(`Storage answered ${status}`);
    this.name = 'StorageHttpError';
  }
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface UploadOptions {
  api: Pick<Api, 'createTransfer' | 'requestPartUrls' | 'completeUpload' | 'deleteTransfer'>;
  put: PutBlob;
  file: Blob & { name: string };
  settings: Omit<CreateTransferRequest, 'file'>;
  signal: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
  /** Parts uploaded at once. */
  concurrency?: number;
  /** Extra attempts per part (or for the single PUT) after the first failure. */
  retries?: number;
  retryDelayMs?: number;
}

const PART_URL_BATCH = 100;

/**
 * Creates the transfer, sends the file straight to storage (multipart for large files, with
 * parallel parts and per-part retries), then completes it. Cancelling via `signal` deletes the
 * half-made transfer.
 */
export async function uploadFile(outer: UploadOptions): Promise<CreateTransferResponse> {
  // Cancelled by the caller, or internally once any part fails for good, so the other parts stop.
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort(outer.signal.reason);
  if (outer.signal.aborted) onOuterAbort();
  outer.signal.addEventListener('abort', onOuterAbort, { once: true });
  const options = { ...outer, signal: controller.signal };
  const { api, file, signal } = options;

  const created = await api.createTransfer(
    { ...options.settings, file: { name: file.name, size: file.size } },
    signal,
  );

  try {
    const body: CompleteUploadInput =
      created.upload.method === 'single'
        ? await uploadSingle(options, created.upload)
        : { parts: await uploadParts(options, created, created.upload) };
    await api.completeUpload(created.transferId, created.manageToken, body, signal);
    return created;
  } catch (err) {
    controller.abort(err);
    // Best effort: the server also drops uploads abandoned for a day.
    void api.deleteTransfer(created.transferId, created.manageToken).catch(() => undefined);
    throw err;
  } finally {
    outer.signal.removeEventListener('abort', onOuterAbort);
  }
}

async function uploadSingle(
  options: UploadOptions,
  upload: { url: string; headers: Record<string, string> },
): Promise<CompleteUploadInput> {
  const total = options.file.size;
  await withRetries(options, () =>
    options.put({
      url: upload.url,
      body: options.file,
      headers: upload.headers,
      signal: options.signal,
      onProgress: (loaded) => options.onProgress?.({ loaded, total }),
    }),
  );
  return {};
}

async function uploadParts(
  options: UploadOptions,
  created: CreateTransferResponse,
  upload: { partSize: number; partCount: number },
) {
  const { file, signal } = options;
  const { partSize, partCount } = upload;
  const loadedByPart = new Map<number, number>();
  const report = () => {
    let loaded = 0;
    for (const bytes of loadedByPart.values()) loaded += bytes;
    options.onProgress?.({ loaded, total: file.size });
  };

  // Part URLs are fetched in batches, on demand, and refetched when a retry needs a fresh one.
  const batches = new Map<number, Promise<Map<number, string>>>();
  const fetchBatch = (batch: number) => {
    const first = batch * PART_URL_BATCH + 1;
    const numbers = range(first, Math.min(first + PART_URL_BATCH - 1, partCount));
    const promise = options.api
      .requestPartUrls(created.transferId, created.manageToken, numbers, signal)
      .then((res) => new Map(res.parts.map((p) => [p.partNumber, p.url])));
    batches.set(batch, promise);
    return promise;
  };
  const partUrl = async (partNumber: number, fresh: boolean) => {
    const batch = Math.floor((partNumber - 1) / PART_URL_BATCH);
    const urls = await (fresh || !batches.has(batch) ? fetchBatch(batch) : batches.get(batch)!);
    const url = urls.get(partNumber);
    if (!url) throw new Error(`No upload URL for part ${partNumber}`);
    return url;
  };

  const etags: Array<{ partNumber: number; etag: string }> = [];
  let next = 1;
  const worker = async () => {
    while (next <= partCount) {
      const partNumber = next++;
      const start = (partNumber - 1) * partSize;
      const body = file.slice(start, Math.min(start + partSize, file.size));
      let attempt = 0;

      const { etag } = await withRetries(options, async () => {
        const url = await partUrl(partNumber, attempt++ > 0);
        loadedByPart.set(partNumber, 0);
        return options.put({
          url,
          body,
          signal,
          onProgress: (loaded) => {
            loadedByPart.set(partNumber, loaded);
            report();
          },
        });
      });
      if (!etag) {
        // Storage CORS must expose ETag, or multipart uploads cannot be completed.
        throw new Error('Storage did not expose the ETag header');
      }
      loadedByPart.set(partNumber, body.size);
      report();
      etags.push({ partNumber, etag });
    }
  };

  const workers = Math.min(options.concurrency ?? 4, partCount);
  await Promise.all(Array.from({ length: workers }, worker));
  return etags.sort((a, b) => a.partNumber - b.partNumber);
}

/** Retries network errors, 5xx and expired URLs (403); never retries after cancellation. */
async function withRetries<T>(options: UploadOptions, run: () => Promise<T>): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelay = options.retryDelayMs ?? 1000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (options.signal.aborted || attempt >= retries || !isRetryable(err)) throw err;
      await sleep(baseDelay * 2 ** attempt, options.signal);
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof StorageHttpError) return err.status >= 500 || err.status === 403;
  return err instanceof TypeError; // network failure
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
