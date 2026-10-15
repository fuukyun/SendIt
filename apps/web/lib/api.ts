import type {
  CompleteUploadInput,
  CompleteUploadResponse,
  CreateTransferResponse,
  DownloadUrlResponse,
  PartUrlsResponse,
  TransferInfoResponse,
  TransferStatusResponse,
  UnlockTransferResponse,
} from '@sendit/shared';

/** z.input of createTransferSchema: what the browser sends (defaults applied by the API). */
export interface CreateTransferRequest {
  file: { name: string; size: number };
  expiresInDays?: number;
  maxDownloads?: number;
  password?: string;
  title?: string;
  message?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds, from Retry-After on 429 responses. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The API's address, from NEXT_PUBLIC_API_URL; empty means the same origin as the web app. */
const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api`;

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  if (res.status === 204) return undefined as T;

  const data = (await res.json().catch(() => ({}))) as { message?: unknown };
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
    const message = typeof data.message === 'string' ? data.message : res.statusText;
    throw new ApiError(res.status, message, retryAfter);
  }
  return data as T;
}

export const api = {
  createTransfer: (body: CreateTransferRequest, signal?: AbortSignal) =>
    request<CreateTransferResponse>('POST', '/transfers', { body, signal }),

  requestPartUrls: (id: string, token: string, partNumbers: number[], signal?: AbortSignal) =>
    request<PartUrlsResponse>('POST', `/transfers/${id}/parts`, {
      body: { partNumbers },
      token,
      signal,
    }),

  completeUpload: (id: string, token: string, body: CompleteUploadInput, signal?: AbortSignal) =>
    request<CompleteUploadResponse>('POST', `/transfers/${id}/complete`, { body, token, signal }),

  getTransfer: (id: string, token: string) =>
    request<TransferStatusResponse>('GET', `/transfers/${id}`, { token }),

  deleteTransfer: (id: string, token: string) =>
    request<void>('DELETE', `/transfers/${id}`, { token }),

  getDownloadInfo: (shareToken: string, accessToken?: string) =>
    request<TransferInfoResponse>('GET', `/d/${shareToken}`, { token: accessToken }),

  unlock: (shareToken: string, password: string) =>
    request<UnlockTransferResponse>('POST', `/d/${shareToken}/unlock`, { body: { password } }),

  createDownloadUrl: (shareToken: string, accessToken?: string) =>
    request<DownloadUrlResponse>('POST', `/d/${shareToken}/url`, { token: accessToken }),
};

export type Api = typeof api;
