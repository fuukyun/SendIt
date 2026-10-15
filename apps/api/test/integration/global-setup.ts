import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { execSync } from 'node:child_process';
import pg from 'pg';
import { integrationEnv } from './env.js';

/** Recreates the test database from the migrations and makes sure the test bucket exists. */
export default async function setup() {
  const env = { ...process.env, ...integrationEnv() };
  await recreateDatabase(env.DATABASE_URL!);
  execSync('pnpm exec prisma migrate deploy', { env, stdio: 'inherit' });
  await ensureBucket(env);
}

/**
 * Starting from an empty database every run keeps tests independent of leftovers and of
 * migration history edits. Only ever touches the `_test` database derived in env.ts.
 */
async function recreateDatabase(url: string) {
  const dbName = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!dbName.endsWith('_test'))
    throw new Error(`Refusing to recreate non-test database ${dbName}`);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const quoted = `"${dbName.replace(/"/g, '""')}"`;
    await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoted}`);
  } finally {
    await client.end();
  }
}

async function ensureBucket(env: NodeJS.ProcessEnv) {
  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
  } finally {
    s3.destroy();
  }
}
