import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  DownloadUrlResponse,
  TransferInfoResponse,
  UnlockTransferResponse,
} from '@sendit/shared';
import { createHmac } from 'node:crypto';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';
import { TransferStatus, type Transfer } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessTokens } from '../security/access-tokens.js';
import { verifyPassword } from '../security/passwords.js';
import { hashToken } from '../security/tokens.js';
import { StorageService } from '../storage/storage.service.js';
import { attachmentDisposition } from './content-disposition.js';

const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;
const MAX_FAILED_UNLOCKS = 5;
const UNLOCK_LOCKOUT_MS = 15 * 60 * 1000;
/** Same answer for unknown, expired, exhausted, deleted and not-yet-uploaded links. */
const LINK_UNAVAILABLE = 'Link not found or no longer available';
// Prisma stores timestamps as UTC in `timestamp without time zone` columns.
const NOW_UTC = "(now() AT TIME ZONE 'UTC')";

export class PasswordLockedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      { message: 'Too many incorrect passwords; try again later', retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export interface ClientInfo {
  ip: string | undefined;
  userAgent: string | undefined;
}

@Injectable()
export class DownloadsService {
  private readonly accessTokens: AccessTokens;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.accessTokens = new AccessTokens(config.APP_SECRET);
  }

  async getInfo(shareToken: string, accessToken?: string): Promise<TransferInfoResponse> {
    const transfer = await this.findAvailable(shareToken);
    if (!this.hasAccess(transfer, accessToken)) return { requiresPassword: true };

    return {
      requiresPassword: false,
      title: transfer.title,
      message: transfer.message,
      expiresAt: transfer.expiresAt.toISOString(),
      downloadsRemaining:
        transfer.maxDownloads === null ? null : transfer.maxDownloads - transfer.downloadCount,
      file: { name: transfer.fileName, size: Number(transfer.size) },
    };
  }

  async unlock(shareToken: string, password: string): Promise<UnlockTransferResponse> {
    const transfer = await this.findAvailable(shareToken);
    if (!transfer.passwordHash) throw new BadRequestException('Link has no password');

    // Count the attempt before checking the password, so parallel guesses cannot slip past the
    // limit while argon2 is busy.
    const rows = await this.prisma.$queryRawUnsafe<Array<{ failed_unlocks: number }>>(
      `UPDATE transfers SET failed_unlocks = failed_unlocks + 1
       WHERE id = $1::uuid AND (locked_until IS NULL OR locked_until <= ${NOW_UTC})
       RETURNING failed_unlocks`,
      transfer.id,
    );
    const attempt = rows[0]?.failed_unlocks;
    if (attempt === undefined) throw await this.lockedException(transfer.id);
    if (attempt > MAX_FAILED_UNLOCKS) throw await this.lockOut(transfer.id);

    if (!(await verifyPassword(transfer.passwordHash, password))) {
      if (attempt === MAX_FAILED_UNLOCKS) await this.lockOut(transfer.id);
      throw new UnauthorizedException('Incorrect password');
    }

    await this.prisma.transfer.update({
      where: { id: transfer.id },
      data: { failedUnlocks: 0 },
    });
    return {
      accessToken: this.accessTokens.issue(transfer.id, ACCESS_TOKEN_TTL_SECONDS),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /** Consumes one download and returns a short-lived URL to fetch the file from storage. */
  async createDownloadUrl(
    shareToken: string,
    accessToken: string | undefined,
    client: ClientInfo,
  ): Promise<DownloadUrlResponse> {
    const transfer = await this.findAvailable(shareToken);
    if (!this.hasAccess(transfer, accessToken)) {
      throw new UnauthorizedException('Password required');
    }

    // Re-checks every condition in the same statement, so concurrent requests can never push
    // the count past the limit.
    const consumed = await this.prisma.$executeRawUnsafe(
      `UPDATE transfers SET download_count = download_count + 1, updated_at = ${NOW_UTC}
       WHERE id = $1::uuid AND status = 'READY' AND expires_at > ${NOW_UTC}
         AND (max_downloads IS NULL OR download_count < max_downloads)`,
      transfer.id,
    );
    if (consumed === 0) throw new NotFoundException(LINK_UNAVAILABLE);

    await this.prisma.downloadEvent.create({
      data: {
        transferId: transfer.id,
        ipHash: this.hashIp(client.ip),
        userAgent: client.userAgent?.slice(0, 512) ?? null,
      },
    });

    return {
      url: await this.storage.presignGet(
        transfer.storageKey,
        attachmentDisposition(transfer.fileName),
      ),
      expiresIn: this.config.DOWNLOAD_URL_TTL_SECONDS,
    };
  }

  private async findAvailable(shareToken: string): Promise<Transfer> {
    const transfer = SHARE_TOKEN.test(shareToken)
      ? await this.prisma.transfer.findUnique({ where: { tokenHash: hashToken(shareToken) } })
      : null;
    if (!transfer || !isAvailable(transfer)) throw new NotFoundException(LINK_UNAVAILABLE);
    return transfer;
  }

  private hasAccess(transfer: Transfer, accessToken: string | undefined): boolean {
    if (!transfer.passwordHash) return true;
    return !!accessToken && this.accessTokens.verify(accessToken, transfer.id);
  }

  private async lockOut(transferId: string): Promise<PasswordLockedException> {
    await this.prisma.transfer.update({
      where: { id: transferId },
      data: { failedUnlocks: 0, lockedUntil: new Date(Date.now() + UNLOCK_LOCKOUT_MS) },
    });
    return new PasswordLockedException(UNLOCK_LOCKOUT_MS / 1000);
  }

  private async lockedException(transferId: string): Promise<PasswordLockedException> {
    const { lockedUntil } = await this.prisma.transfer.findUniqueOrThrow({
      where: { id: transferId },
      select: { lockedUntil: true },
    });
    const remainingMs = (lockedUntil?.getTime() ?? Date.now()) - Date.now();
    return new PasswordLockedException(Math.max(1, Math.ceil(remainingMs / 1000)));
  }

  /** Keyed hash: download logs can be correlated without storing addresses. */
  private hashIp(ip: string | undefined): string {
    return createHmac('sha256', this.config.APP_SECRET)
      .update(`ip:${ip ?? 'unknown'}`)
      .digest('hex');
  }
}

function isAvailable(transfer: Transfer, now = new Date()): boolean {
  return (
    transfer.status === TransferStatus.READY &&
    transfer.expiresAt > now &&
    (transfer.maxDownloads === null || transfer.downloadCount < transfer.maxDownloads)
  );
}
