import { ConsoleLogger, Logger } from '@nestjs/common';
import type { RequestHandler } from 'express';

/** JSON lines in production (for log collectors), readable colored output elsewhere. */
export function createLogger(nodeEnv = process.env.NODE_ENV): ConsoleLogger {
  const production = nodeEnv === 'production';
  return new ConsoleLogger({ json: production, colors: !production });
}

/**
 * Share tokens are bearer secrets that live in the URL path; they must never reach logs.
 * Query strings are dropped for the same reason.
 */
export function redactPath(url: string): string {
  const path = url.split('?')[0] ?? '';
  return path.replace(/\/d\/[^/]+/, '/d/:token');
}

/** One line per request: method, redacted path, status, duration. */
export function requestLogger(): RequestHandler {
  const logger = new Logger('HTTP');
  return (req, res, next) => {
    const started = performance.now();
    res.on('finish', () => {
      const ms = Math.round(performance.now() - started);
      logger.log(`${req.method} ${redactPath(req.originalUrl)} ${res.statusCode} ${ms}ms`);
    });
    next();
  };
}
