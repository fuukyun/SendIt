import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';
import { RATE_LIMITS } from './rate-limits.js';

/**
 * Applies per-IP rate limits (see rate-limits.ts) to every route. Counters live in memory, so
 * each API instance counts on its own; the per-link password lockout is in Postgres regardless.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: 'default', ...RATE_LIMITS.DEFAULT }],
        skipIf: () => !config.RATE_LIMIT_ENABLED,
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
