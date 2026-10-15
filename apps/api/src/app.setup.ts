import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { requestLogger } from './core/logging/logging.js';
import { APP_CONFIG } from './core/config/config.module.js';
import type { AppConfig } from './core/config/config.js';

/**
 * Largest legitimate body: completing a multipart upload with every part's ETag. 10,000 parts
 * (the S3 maximum) at ~70 bytes each stays well under this.
 */
const JSON_BODY_LIMIT = '1mb';

/** HTTP setup shared by the server entrypoint and tests. */
export function configureApp(app: NestExpressApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.use(requestLogger());
  app.use(helmet());
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(bodyParserErrors);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.WEB_ORIGIN });
  app.enableShutdownHooks();
  return config;
}

/**
 * Oversized or malformed bodies are client errors; answer them directly instead of letting them
 * surface as unhandled exceptions in the error log.
 */
const bodyParserErrors: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  const status = (err as { status?: unknown }).status;
  const type = (err as { type?: unknown }).type;
  if (typeof type === 'string' && typeof status === 'number' && status >= 400 && status < 500) {
    const message = status === 413 ? 'Request body too large' : 'Malformed request body';
    res.status(status).json({ statusCode: status, message });
    return;
  }
  next(err);
};
