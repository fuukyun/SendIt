import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Variables already set in the environment (CI, tests) win over the repo's .env file.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
});
