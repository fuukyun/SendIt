import { z } from 'zod';
import { LIMITS } from './limits.js';

export const createTransferSchema = z.object({
  file: z.object({
    name: z.string().trim().min(1).max(LIMITS.maxFileNameLength),
    size: z.number().int().positive().max(LIMITS.maxFileBytes),
  }),
  expiresInDays: z
    .number()
    .int()
    .min(LIMITS.minExpiryDays)
    .max(LIMITS.maxExpiryDays)
    .default(LIMITS.defaultExpiryDays),
  maxDownloads: z.number().int().min(1).max(LIMITS.maxDownloadsCap).optional(),
  password: z.string().min(LIMITS.minPasswordLength).max(LIMITS.maxPasswordLength).optional(),
  title: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
});

export const requestPartUrlsSchema = z.object({
  partNumbers: z
    .array(z.number().int().min(1).max(10_000))
    .min(1)
    .max(LIMITS.maxPartUrlsPerRequest),
});

export const completeUploadSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10_000),
        etag: z.string().min(1).max(256),
      }),
    )
    .max(10_000)
    .optional(),
});

export const unlockTransferSchema = z.object({
  password: z.string().min(1).max(LIMITS.maxPasswordLength),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type RequestPartUrlsInput = z.infer<typeof requestPartUrlsSchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
export type UnlockTransferInput = z.infer<typeof unlockTransferSchema>;

/** REJECTED: the uploaded size did not match the declared size. */
export type TransferStatus = 'UPLOADING' | 'READY' | 'REJECTED' | 'EXPIRED' | 'DELETED';

export interface TransferFile {
  name: string;
  size: number;
}

export type UploadInstructions =
  | {
      method: 'single';
      url: string;
      /** Headers the browser must send with the PUT; they are part of the signature. */
      headers: Record<string, string>;
    }
  | {
      method: 'multipart';
      partSize: number;
      partCount: number;
    };

export interface CreateTransferResponse {
  transferId: string;
  shareUrl: string;
  /** Token proving ownership; send as `Authorization: Bearer <token>` to manage the transfer. */
  manageToken: string;
  /**
   * Owner's page. The manage and share tokens travel in the fragment (`#key=…&share=…`), which
   * browsers never send to servers. See {@link parseManageFragment}.
   */
  manageUrl: string;
  expiresAt: string;
  file: TransferFile;
  upload: UploadInstructions;
}

/** What the owner sees about their transfer. */
export interface TransferStatusResponse {
  transferId: string;
  status: TransferStatus;
  title: string | null;
  createdAt: string;
  expiresAt: string;
  downloadCount: number;
  maxDownloads: number | null;
  file: TransferFile;
}

export function buildManageFragment(manageToken: string, shareToken: string): string {
  return new URLSearchParams({ key: manageToken, share: shareToken }).toString();
}

export function parseManageFragment(
  fragment: string,
): { manageToken: string; shareToken: string } | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const manageToken = params.get('key');
  const shareToken = params.get('share');
  return manageToken && shareToken ? { manageToken, shareToken } : null;
}

export interface PartUrlsResponse {
  parts: Array<{ partNumber: number; url: string }>;
}

export interface CompleteUploadResponse {
  status: TransferStatus;
}

/** Returned for password-protected links until the recipient unlocks them. */
export interface LockedTransferInfo {
  requiresPassword: true;
}

export interface TransferInfo {
  requiresPassword: false;
  title: string | null;
  message: string | null;
  expiresAt: string;
  /** null = unlimited. */
  downloadsRemaining: number | null;
  file: TransferFile;
}

export type TransferInfoResponse = LockedTransferInfo | TransferInfo;

export interface UnlockTransferResponse {
  /** Send as `Authorization: Bearer <token>` on later download requests. */
  accessToken: string;
  expiresIn: number;
}

export interface DownloadUrlResponse {
  url: string;
  expiresIn: number;
}
