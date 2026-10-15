import { Module } from '@nestjs/common';
import { ConfigModule } from './core/config/config.module.js';
import { PrismaModule } from './core/database/prisma.module.js';
import { RateLimitModule } from './core/rate-limit/rate-limit.module.js';
import { StorageModule } from './core/storage/storage.module.js';
import { CleanupModule } from './modules/cleanup/cleanup.module.js';
import { DownloadsModule } from './modules/downloads/downloads.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { TransfersModule } from './modules/transfers/transfers.module.js';

@Module({
  imports: [
    // Infrastructure
    ConfigModule,
    PrismaModule,
    StorageModule,
    RateLimitModule,
    // Features
    TransfersModule,
    DownloadsModule,
    CleanupModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
