import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { unlockTransferSchema, type UnlockTransferInput } from '@sendit/shared';
import type { Request, Response } from 'express';
import { bearerToken } from '../common/bearer.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RATE_LIMITS } from '../security/rate-limits.js';
import { DownloadsService, PasswordLockedException } from './downloads.service.js';

/** Public endpoints for recipients of a share link. */
@Controller('d')
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  @Get(':token')
  info(@Param('token') token: string, @Headers('authorization') authorization?: string) {
    return this.downloads.getInfo(token, bearerToken(authorization));
  }

  @Post(':token/unlock')
  @HttpCode(200)
  @Throttle({ default: RATE_LIMITS.UNLOCK })
  async unlock(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(unlockTransferSchema)) body: UnlockTransferInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      return await this.downloads.unlock(token, body.password);
    } catch (err) {
      if (err instanceof PasswordLockedException) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
      }
      throw err;
    }
  }

  @Post(':token/url')
  @HttpCode(200)
  @Throttle({ default: RATE_LIMITS.DOWNLOAD_URL })
  createDownloadUrl(@Param('token') token: string, @Req() req: Request) {
    return this.downloads.createDownloadUrl(token, bearerToken(req.headers.authorization), {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
