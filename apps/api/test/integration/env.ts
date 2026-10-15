import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MiB = 1024 * 1024;
const repoEnvFile = fileURLToPath(new URL('../../../../.env', import.meta.url));

/**
 * Environment for integration tests: the dev services from the repo's .env, but a separate
 * database and bucket so tests never touch dev data, and small multipart sizes so multipart
 * uploads can be tested with ~11 MiB files.
 */
export function integrationEnv(): Record<string, string> {
  // Does not override variables that are already set (e.g. in CI).
  if (existsSync(repoEnvFile)) process.loadEnvFile(repoEnvFile);

  const databaseUrl = new URL(required('DATABASE_URL'));
  databaseUrl.pathname = `${databaseUrl.pathname}_test`;

  return {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl.toString(),
    S3_BUCKET: `${required('S3_BUCKET')}-test`,
    // Tests run sweeps themselves.
    CLEANUP_INTERVAL_SECONDS: '0',
    // Tests send many requests from one address; security.spec.ts turns limits back on.
    RATE_LIMIT_ENABLED: 'false',
    MULTIPART_THRESHOLD_BYTES: String(6 * MiB),
    MULTIPART_PART_BYTES: String(5 * MiB),
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (copy .env.example to .env)`);
  return value;
}
