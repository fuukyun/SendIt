import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  completeUploadSchema,
  createTransferSchema,
  requestPartUrlsSchema,
  type CompleteUploadInput,
  type CreateTransferInput,
  type RequestPartUrlsInput,
} from '@sendit/shared';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe.js';
import type { Transfer } from '../../generated/prisma/client.js';
import { RATE_LIMITS } from '../../core/rate-limit/rate-limits.js';
import { ManagedTransfer, ManageTokenGuard } from './manage-token.guard.js';
import { TransfersService } from './transfers.service.js';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @Throttle({ default: RATE_LIMITS.CREATE_TRANSFER })
  create(@Body(new ZodValidationPipe(createTransferSchema)) body: CreateTransferInput) {
    return this.transfers.create(body);
  }

  @Get(':transferId')
  @UseGuards(ManageTokenGuard)
  getStatus(@ManagedTransfer() transfer: Transfer) {
    return this.transfers.getStatus(transfer);
  }

  @Post(':transferId/parts')
  @HttpCode(200)
  @UseGuards(ManageTokenGuard)
  presignParts(
    @ManagedTransfer() transfer: Transfer,
    @Body(new ZodValidationPipe(requestPartUrlsSchema)) body: RequestPartUrlsInput,
  ) {
    return this.transfers.presignParts(transfer, body);
  }

  @Post(':transferId/complete')
  @HttpCode(200)
  @UseGuards(ManageTokenGuard)
  complete(
    @ManagedTransfer() transfer: Transfer,
    @Body(new ZodValidationPipe(completeUploadSchema)) body: CompleteUploadInput,
  ) {
    return this.transfers.complete(transfer, body);
  }

  @Delete(':transferId')
  @HttpCode(204)
  @UseGuards(ManageTokenGuard)
  async delete(@ManagedTransfer() transfer: Transfer) {
    await this.transfers.delete(transfer);
  }
}
