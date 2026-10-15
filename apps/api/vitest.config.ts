import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Unit tests: no database or storage needed. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/*.spec.ts'],
    env: {
      DATABASE_URL: 'postgresql://unused:unused@localhost:1/unused',
      S3_BUCKET: 'unused',
      S3_ACCESS_KEY_ID: 'unused',
      S3_SECRET_ACCESS_KEY: 'unused',
      APP_SECRET: 'unit-test-secret-unit-test-secret',
    },
  },
  // esbuild does not emit decorator metadata, which NestJS DI relies on; SWC does.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
