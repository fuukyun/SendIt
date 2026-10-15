import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { integrationEnv } from './test/integration/env.js';

/** Integration tests: need PostgreSQL and MinIO from `pnpm docker:up`. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    env: integrationEnv(),
    // Test files share one database.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
