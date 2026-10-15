import { LIMITS } from '@sendit/shared';
import { z } from 'zod';

const S3_MIN_PART_BYTES = 5 * 1024 * 1024;

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),

  /**
   * MinIO, spoken to through the S3 API. The API and the browser both use this address, so it
   * must be reachable from the browser too.
   */
  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),

  MULTIPART_THRESHOLD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(LIMITS.multipartThresholdBytes),
  MULTIPART_PART_BYTES: z.coerce
    .number()
    .int()
    .min(S3_MIN_PART_BYTES)
    .default(LIMITS.multipartPartBytes),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
  /** Short on purpose: each issued download URL consumes one download. */
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),

  /** How often expired files are deleted; 0 turns the built-in cleanup off (tests). */
  CLEANUP_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(86_400).default(600),

  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /** Signs download access tokens and keys IP hashes. Rotating it signs everyone out. */
  APP_SECRET: z.string().min(32),
});

const DEV_SECRET_PREFIX = 'dev-only';

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema
    .refine((c) => c.NODE_ENV !== 'production' || !c.APP_SECRET.startsWith(DEV_SECRET_PREFIX), {
      path: ['APP_SECRET'],
      message: 'The example secret from .env.example must not be used in production',
    })
    .safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
