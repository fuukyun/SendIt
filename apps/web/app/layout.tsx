import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FileIcon } from '@/components/ui/icons';
import { t } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: t.appName,
  description: t.tagline,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafc' },
    { media: '(prefers-color-scheme: dark)', color: '#16171f' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="flex min-h-dvh flex-col antialiased">
        <header className="mx-auto flex w-full max-w-xl items-center gap-2.5 px-4 pt-8 pb-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white">
              <FileIcon />
            </span>
            <span className="text-lg font-bold tracking-tight">{t.appName}</span>
          </Link>
          <nav className="ml-auto flex gap-1 text-sm font-medium">
            <Link
              href="/"
              className="rounded-lg px-3 py-1.5 text-muted hover:bg-subtle hover:text-ink"
            >
              {t.nav.send}
            </Link>
            <Link
              href="/history"
              className="rounded-lg px-3 py-1.5 text-muted hover:bg-subtle hover:text-ink"
            >
              {t.nav.history}
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-12">{children}</main>
        <footer className="mx-auto w-full max-w-xl px-4 pb-8 text-center text-xs text-muted">
          {t.footer}
        </footer>
      </body>
    </html>
  );
}
