const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

/** Product limits shared by the API (enforcement) and the web app (early feedback). */
export const LIMITS = {
  /** Max size of the single file in a transfer. */
  maxFileBytes: 2 * GiB,
  maxFileNameLength: 255,
  /** Files at or above this size are uploaded with S3 multipart upload. */
  multipartThresholdBytes: 100 * MiB,
  /** Preferred multipart part size. S3 requires at least 5 MiB for all but the last part. */
  multipartPartBytes: 16 * MiB,
  /** Max part URLs handed out per request. */
  maxPartUrlsPerRequest: 100,
  minExpiryDays: 1,
  maxExpiryDays: 7,
  defaultExpiryDays: 7,
  maxDownloadsCap: 1000,
  minPasswordLength: 6,
  maxPasswordLength: 128,
} as const;
