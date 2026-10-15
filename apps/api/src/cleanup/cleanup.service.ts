import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';
import { TransferStatus, type Prisma, type Transfer } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

const BATCH_SIZE = 100;
const MAX_BATCHES_PER_SWEEP = 50;
/** Uploads never completed within this window are abandoned. */
const ABANDONED_UPLOAD_MS = 24 * 60 * 60 * 1000;
/** Statuses whose object may still be in storage once the link has expired. */
const LIVE_STATUSES = [TransferStatus.UPLOADING, TransferStatus.READY, TransferStatus.REJECTED];

export interface SweepResult {
  expired: number;
  exhausted: number;
  abandoned: number;
}

/**
 * Deletes stored files that can no longer be downloaded, every CLEANUP_INTERVAL_SECONDS inside
 * the API process. Safe with several API instances: each purge is conditional and idempotent.
 */
@Injectable()
export class CleanupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    const seconds = this.config.CLEANUP_INTERVAL_SECONDS;
    if (seconds === 0) return;
    // Right away too, so a server that was down catches up on expired files.
    void this.scheduledSweep();
    this.timer = setInterval(() => void this.scheduledSweep(), seconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Never overlaps with itself and never throws: the next run simply tries again. */
  private async scheduledSweep() {
    if (this.running) return;
    this.running = true;
    try {
      await this.sweep();
    } catch (err) {
      this.logger.error(`Cleanup sweep failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  async sweep(now = new Date()): Promise<SweepResult> {
    // The last issued download URL must stay usable until it expires.
    const downloadGraceMs = (this.config.DOWNLOAD_URL_TTL_SECONDS + 60) * 1000;

    const result: SweepResult = {
      expired: await this.purgeWhere({ status: { in: LIVE_STATUSES }, expiresAt: { lte: now } }),
      exhausted: await this.purgeWhere({
        status: TransferStatus.READY,
        maxDownloads: { not: null },
        downloadCount: { gte: this.prisma.transfer.fields.maxDownloads },
        updatedAt: { lte: new Date(now.getTime() - downloadGraceMs) },
      }),
      abandoned: await this.purgeWhere({
        status: TransferStatus.UPLOADING,
        createdAt: { lte: new Date(now.getTime() - ABANDONED_UPLOAD_MS) },
      }),
    };

    if (Object.values(result).some((n) => n > 0)) {
      this.logger.log(`Sweep: ${JSON.stringify(result)}`);
    }
    return result;
  }

  private async purgeWhere(where: Prisma.TransferWhereInput): Promise<number> {
    let purged = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch++) {
      const transfers = await this.prisma.transfer.findMany({ where, take: BATCH_SIZE });
      let purgedInBatch = 0;
      for (const transfer of transfers) {
        if (await this.purge(transfer)) purgedInBatch++;
      }
      purged += purgedInBatch;
      // A short batch is the last one; a batch of failures would just be fetched again.
      if (transfers.length < BATCH_SIZE || purgedInBatch === 0) break;
    }
    return purged;
  }

  /** Removes the stored object first, so a failure leaves the row for the next sweep to retry. */
  private async purge(transfer: Transfer): Promise<boolean> {
    try {
      if (transfer.status === TransferStatus.UPLOADING && transfer.uploadId) {
        await this.storage
          .abortMultipartUpload(transfer.storageKey, transfer.uploadId)
          .catch(() => undefined); // already completed or aborted
      }
      await this.storage.deleteObject(transfer.storageKey);
    } catch (err) {
      this.logger.warn(`Could not delete ${transfer.storageKey}: ${String(err)}`);
      return false;
    }

    const { count } = await this.prisma.transfer.updateMany({
      where: { id: transfer.id, status: transfer.status },
      data: { status: TransferStatus.EXPIRED, deletedAt: new Date() },
    });
    return count === 1;
  }
}
