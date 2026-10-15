import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  buildManageFragment,
  type CompleteUploadInput,
  type CompleteUploadResponse,
  type CreateTransferInput,
  type CreateTransferResponse,
  type PartUrlsResponse,
  type RequestPartUrlsInput,
  type TransferStatusResponse,
  type UploadInstructions,
} from '@sendit/shared';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG } from '../../core/config/config.module.js';
import type { AppConfig } from '../../core/config/config.js';
import { TransferStatus, type Transfer } from '../../generated/prisma/client.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import { hashPassword } from '../../common/crypto/passwords.js';
import { generateToken, hashToken } from '../../common/crypto/tokens.js';
import { StorageService } from '../../core/storage/storage.service.js';
import { sanitizeFileName } from './file-name.js';
import { partLength, planUpload } from './upload-plan.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Any file type is accepted, so the browser's guess is never trusted; downloads are attachments. */
const STORED_CONTENT_TYPE = 'application/octet-stream';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(input: CreateTransferInput): Promise<CreateTransferResponse> {
    const fileName = sanitizeFileName(input.file.name);

    const id = randomUUID();
    const shareToken = generateToken();
    const manageToken = generateToken();
    const storageKey = `transfers/${id}`;
    const size = input.file.size;
    const expiresAt = new Date(Date.now() + input.expiresInDays * DAY_MS);
    const passwordHash = input.password ? await hashPassword(input.password) : null;
    const plan = planUpload(size, {
      thresholdBytes: this.config.MULTIPART_THRESHOLD_BYTES,
      partBytes: this.config.MULTIPART_PART_BYTES,
    });

    const uploadId =
      plan.method === 'multipart'
        ? await this.storage.createMultipartUpload(storageKey, STORED_CONTENT_TYPE)
        : null;

    try {
      await this.prisma.transfer.create({
        data: {
          id,
          tokenHash: hashToken(shareToken),
          manageTokenHash: hashToken(manageToken),
          title: input.title || null,
          message: input.message || null,
          passwordHash,
          expiresAt,
          maxDownloads: input.maxDownloads ?? null,
          fileName,
          size: BigInt(size),
          storageKey,
          uploadId,
          partSize: plan.method === 'multipart' ? plan.partSize : null,
          partCount: plan.method === 'multipart' ? plan.partCount : null,
        },
      });
    } catch (err) {
      // Bucket lifecycle rules would eventually clean this up too.
      if (uploadId) {
        await this.storage.abortMultipartUpload(storageKey, uploadId).catch(() => undefined);
      }
      throw err;
    }

    const upload: UploadInstructions =
      plan.method === 'multipart'
        ? { method: 'multipart', partSize: plan.partSize, partCount: plan.partCount }
        : {
            method: 'single',
            url: await this.storage.presignPut(storageKey, STORED_CONTENT_TYPE, size),
            headers: { 'Content-Type': STORED_CONTENT_TYPE },
          };

    const origin = this.config.WEB_ORIGIN;
    return {
      transferId: id,
      shareUrl: `${origin}/d/${shareToken}`,
      manageToken,
      // In the fragment so neither token ever reaches a server or its logs.
      manageUrl: `${origin}/t/${id}/manage#${buildManageFragment(manageToken, shareToken)}`,
      expiresAt: expiresAt.toISOString(),
      file: { name: fileName, size },
      upload,
    };
  }

  getStatus(transfer: Transfer): TransferStatusResponse {
    return {
      transferId: transfer.id,
      status: transfer.status,
      title: transfer.title,
      createdAt: transfer.createdAt.toISOString(),
      expiresAt: transfer.expiresAt.toISOString(),
      downloadCount: transfer.downloadCount,
      maxDownloads: transfer.maxDownloads,
      file: { name: transfer.fileName, size: Number(transfer.size) },
    };
  }

  async presignParts(transfer: Transfer, input: RequestPartUrlsInput): Promise<PartUrlsResponse> {
    this.assertUploading(transfer);
    const { uploadId, partSize, partCount } = transfer;
    if (!uploadId || !partSize || !partCount) {
      throw new BadRequestException('Transfer is not a multipart upload');
    }

    const partNumbers = [...new Set(input.partNumbers)];
    if (partNumbers.some((n) => n > partCount)) {
      throw new BadRequestException(`Part numbers must be between 1 and ${partCount}`);
    }

    const size = Number(transfer.size);
    return {
      parts: await Promise.all(
        partNumbers.map(async (partNumber) => ({
          partNumber,
          url: await this.storage.presignUploadPart(
            transfer.storageKey,
            uploadId,
            partNumber,
            partLength(size, partSize, partCount, partNumber),
          ),
        })),
      ),
    };
  }

  async complete(transfer: Transfer, input: CompleteUploadInput): Promise<CompleteUploadResponse> {
    // Retries after a successful completion are answered with the current state.
    if (transfer.status !== TransferStatus.UPLOADING) return { status: transfer.status };

    if (transfer.uploadId) {
      await this.completeMultipart(transfer, input);
    } else if (input.parts) {
      throw new BadRequestException('Transfer is not a multipart upload');
    }

    const stored = await this.storage.headObject(transfer.storageKey);
    if (!stored) throw new BadRequestException('File has not been uploaded');
    if (stored.size !== Number(transfer.size)) {
      await this.storage.deleteObject(transfer.storageKey);
      await this.prisma.transfer.update({
        where: { id: transfer.id },
        data: { status: TransferStatus.REJECTED },
      });
      throw new UnprocessableEntityException('Uploaded size does not match the declared size');
    }

    // Conditional, so a transfer deleted or expired meanwhile is never brought back.
    await this.prisma.transfer.updateMany({
      where: { id: transfer.id, status: TransferStatus.UPLOADING },
      data: { status: TransferStatus.READY },
    });

    const { status } = await this.prisma.transfer.findUniqueOrThrow({
      where: { id: transfer.id },
      select: { status: true },
    });
    return { status };
  }

  /** Lets the owner take the file down at any time. Idempotent. */
  async delete(transfer: Transfer): Promise<void> {
    if (transfer.status === TransferStatus.DELETED) return;
    if (transfer.status === TransferStatus.UPLOADING && transfer.uploadId) {
      await this.storage
        .abortMultipartUpload(transfer.storageKey, transfer.uploadId)
        .catch(() => undefined); // already completed or aborted
    }
    await this.storage.deleteObject(transfer.storageKey);
    await this.prisma.transfer.update({
      where: { id: transfer.id },
      data: { status: TransferStatus.DELETED, deletedAt: new Date() },
    });
  }

  private async completeMultipart(transfer: Transfer, input: CompleteUploadInput) {
    const parts = [...(input.parts ?? [])].sort((a, b) => a.partNumber - b.partNumber);
    const complete =
      parts.length === transfer.partCount && parts.every((p, i) => p.partNumber === i + 1);
    if (!complete) {
      throw new BadRequestException(`Expected ETags for parts 1..${transfer.partCount}`);
    }

    try {
      await this.storage.completeMultipartUpload(transfer.storageKey, transfer.uploadId!, parts);
    } catch (err) {
      // A retry after an earlier call already assembled the object fails with NoSuchUpload;
      // the size check that follows decides whether the object is usable.
      if (await this.storage.headObject(transfer.storageKey)) return;
      this.logger.warn(`CompleteMultipartUpload failed for ${transfer.id}: ${String(err)}`);
      throw new BadRequestException('Could not assemble the upload; check the part ETags');
    }
  }

  private assertUploading(transfer: Transfer) {
    if (transfer.status !== TransferStatus.UPLOADING) {
      throw new ConflictException('Transfer is no longer accepting uploads');
    }
  }
}
