import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { CreateTransferResponse } from '@sendit/shared';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { CleanupService } from '../../src/modules/cleanup/cleanup.service.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { StorageService } from '../../src/core/storage/storage.service.js';

export interface TestContext {
  app: NestExpressApplication;
  prisma: PrismaService;
  storage: StorageService;
  cleanup: CleanupService;
}

/** The HTTP app plus the cleanup service, which tests call directly instead of on a timer. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    storage: app.get(StorageService),
    cleanup: app.get(CleanupService),
  };
}

export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe('TRUNCATE download_events, transfers CASCADE');
}

/** Uploads to a pre-signed URL the way a browser would. */
export function putToUrl(url: string, body: Uint8Array, headers: Record<string, string> = {}) {
  return fetch(url, { method: 'PUT', body, headers });
}

export function bytes(length: number, fill = 0x61): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

export interface UploadedTransfer {
  transfer: CreateTransferResponse;
  shareToken: string;
}

/** Creates a transfer and uploads `content` through the real flow; it ends up READY. */
export async function uploadFile(
  ctx: TestContext,
  name: string,
  content: Uint8Array,
  options: { password?: string; maxDownloads?: number } = {},
): Promise<UploadedTransfer> {
  const api = request(ctx.app.getHttpServer());
  const res = await api
    .post('/api/transfers')
    .send({ ...options, file: { name, size: content.length } })
    .expect(201);
  const transfer = res.body as CreateTransferResponse;
  if (transfer.upload.method !== 'single') throw new Error('expected single upload');

  const put = await putToUrl(transfer.upload.url, content, transfer.upload.headers);
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);
  await request(ctx.app.getHttpServer())
    .post(`/api/transfers/${transfer.transferId}/complete`)
    .set('Authorization', `Bearer ${transfer.manageToken}`)
    .send({})
    .expect(200);

  return { transfer, shareToken: transfer.shareUrl.split('/').pop()! };
}
