'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FileIcon, CheckIcon, CopyIcon, XIcon } from '@/components/ui/icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatBytes, formatDateTime } from '@/lib/format';
import { clearHistory, removeFromHistory, useHistory, type HistoryEntry } from '@/lib/history';
import { t } from '@/lib/i18n';
import { useHistoryStatuses, type EntryStatus } from '@/lib/use-history-statuses';

export function HistoryView() {
  const entries = useHistory();
  const statuses = useHistoryStatuses(entries);
  const [confirmClear, setConfirmClear] = useState(false);
  // localStorage only exists in the browser; render the list after mounting.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-xl font-bold">{t.history.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.history.subtitle}</p>
      </div>

      {entries.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-subtle text-muted">
            <FileIcon />
          </span>
          <p className="text-muted">{t.history.empty}</p>
          <Link
            href="/"
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t.history.sendFirst}
          </Link>
        </Card>
      ) : (
        <>
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.transferId}>
                <HistoryItem entry={entry} status={statuses[entry.transferId]} />
              </li>
            ))}
          </ul>

          <div className="space-y-2 pt-2">
            <Button
              variant={confirmClear ? 'danger' : 'ghost'}
              block
              onClick={() => (confirmClear ? clearHistory() : setConfirmClear(true))}
              onBlur={() => setConfirmClear(false)}
            >
              {confirmClear ? t.history.confirmClear : t.history.clear}
            </Button>
            <p className="px-1 text-center text-xs leading-relaxed text-muted">
              {t.history.clearHint}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function HistoryItem({ entry, status }: { entry: HistoryEntry; status: EntryStatus | undefined }) {
  const [copied, setCopied] = useState(false);
  const transfer = status?.kind === 'loaded' ? status.transfer : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the manage page shows the link in a selectable field.
    }
  }

  return (
    <Card className="!p-4 sm:!p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <FileIcon />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold" title={entry.fileName}>
              {entry.title || entry.fileName}
            </p>
            {transfer && <StatusBadge status={transfer.status} />}
          </div>
          <p className="truncate text-sm text-muted">
            {entry.title ? `${entry.fileName} · ` : ''}
            {formatBytes(entry.size)} · {t.history.sentAt(formatDateTime(entry.createdAt))}
          </p>
          {transfer && (
            <p className="text-sm text-muted">
              {t.history.downloads(transfer.downloadCount, transfer.maxDownloads)}
              {['READY', 'UPLOADING'].includes(transfer.status) &&
                ` · ${t.history.expiresAt(formatDateTime(transfer.expiresAt))}`}
            </p>
          )}
          {status?.kind === 'not-found' && (
            <p className="text-sm text-muted">{t.history.notFound}</p>
          )}
          {status?.kind === 'error' && (
            <p className="text-sm text-red-600">{t.history.loadFailed}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {transfer?.status === 'READY' && (
          <Button variant="secondary" onClick={copy} className="!py-2">
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? t.common.copied : t.history.copyLink}
          </Button>
        )}
        <a
          href={entry.manageUrl}
          className="inline-flex items-center rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:bg-subtle"
        >
          {t.history.manage}
        </a>
        <Button
          variant="ghost"
          onClick={() => removeFromHistory(entry.transferId)}
          className="ml-auto !px-2.5 !py-2"
          aria-label={t.history.remove}
          title={t.history.remove}
        >
          <XIcon />
        </Button>
      </div>
    </Card>
  );
}
