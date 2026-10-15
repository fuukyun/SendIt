import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const required = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  APP_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig(required);
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      WEB_ORIGIN: 'http://localhost:3000',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      RATE_LIMIT_ENABLED: true,
    });
  });

  it('parses booleans', () => {
    expect(loadConfig({ ...required, RATE_LIMIT_ENABLED: 'false' }).RATE_LIMIT_ENABLED).toBe(false);
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ ...required, API_PORT: 'abc' })).toThrow(
      /Invalid environment configuration/,
    );
    expect(() => loadConfig({ ...required, MULTIPART_PART_BYTES: '1024' })).toThrow();
  });

  it('refuses the example secret in production only', () => {
    const exampleSecret = 'dev-only-secret-change-me-in-production-0123456789';
    expect(loadConfig({ ...required, APP_SECRET: exampleSecret }).APP_SECRET).toBe(exampleSecret);
    expect(() =>
      loadConfig({ ...required, APP_SECRET: exampleSecret, NODE_ENV: 'production' }),
    ).toThrow(/must not be used in production/);
    expect(() => loadConfig({ ...required, APP_SECRET: 'short' })).toThrow(/APP_SECRET/);
  });

  it('requires database and storage settings', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
