import { existsSync } from 'node:fs';
import type { NextConfig } from 'next';

// One .env for the whole repo; variables already set (e.g. in CI) take precedence.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

const isDev = process.env.NODE_ENV !== 'production';

function origin(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

/**
 * The browser talks to the API and uploads straight to MinIO, so both must be allowed. Next.js
 * injects inline scripts, hence 'unsafe-inline'; the dev server additionally needs eval.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src ${[
    "'self'",
    origin(process.env.NEXT_PUBLIC_API_URL),
    origin(process.env.S3_ENDPOINT),
  ]
    .filter(Boolean)
    .join(' ')}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          // Share and manage tokens live in URLs; never leak them to other sites.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
