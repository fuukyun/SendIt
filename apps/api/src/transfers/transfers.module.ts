import { Module } from '@nestjs/common';
import { ManageTokenGuard } from './manage-token.guard.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  controllers: [TransfersController],
  providers: [TransfersService, ManageTokenGuard],
})
export class TransfersModule {}
