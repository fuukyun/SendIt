import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Transfer } from '../../generated/prisma/client.js';
import { bearerToken } from '../../common/http/bearer.js';
import { isUuid } from '../../common/http/uuid.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import { tokenMatchesHash } from '../../common/crypto/tokens.js';

interface ManagedRequest extends Request {
  transfer?: Transfer;
}

/**
 * Lets the request through only with the transfer's manage token (`Authorization: Bearer ...`).
 * Unknown ids and wrong tokens get the same 404, so the endpoint cannot be used to probe ids.
 */
@Injectable()
export class ManageTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ManagedRequest>();
    const token = bearerToken(req.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing manage token');

    const id = req.params['transferId'];
    const transfer = isUuid(id) ? await this.prisma.transfer.findUnique({ where: { id } }) : null;
    if (!transfer || !tokenMatchesHash(token, transfer.manageTokenHash)) {
      throw new NotFoundException('Transfer not found');
    }

    req.transfer = transfer;
    return true;
  }
}

/** The transfer loaded by {@link ManageTokenGuard}. */
export const ManagedTransfer = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const transfer = context.switchToHttp().getRequest<ManagedRequest>().transfer;
  if (!transfer) throw new Error('ManagedTransfer used without ManageTokenGuard');
  return transfer;
});
