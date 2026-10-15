import { Module } from '@nestjs/common';
import { CleanupModule } from './cleanup/cleanup.module.js';
import { ConfigModule } from './config/config.module.js';
import { DownloadsModule } from './downloads/downloads.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SecurityModule } from './security/security.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TransfersModule } from './transfers/transfers.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    StorageModule,
    SecurityModule,
    TransfersModule,
    DownloadsModule,
    CleanupModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
