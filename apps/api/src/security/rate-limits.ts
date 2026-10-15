const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Per-client-IP limits. Every route gets DEFAULT; the others tighten specific routes via
 * `@Throttle`. `blockDuration` keeps a client out for that long once it exceeds the limit.
 */
export const RATE_LIMITS = {
  DEFAULT: { ttl: MINUTE, limit: 120 },
  /** Each transfer stores up to 2 GiB. */
  CREATE_TRANSFER: { ttl: HOUR, limit: 20 },
  /** On top of the per-link lockout after 5 wrong passwords. */
  UNLOCK: { ttl: 15 * MINUTE, limit: 20, blockDuration: 15 * MINUTE },
  DOWNLOAD_URL: { ttl: MINUTE, limit: 30 },
} as const;
