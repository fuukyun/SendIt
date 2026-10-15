'use client';

import type { CreateTransferResponse } from '@sendit/shared';
import Link from 'next/link';
import { FileSummary } from '@/components/file-summary';
import { TransferStatusAlert } from '@/components/transfer-status';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyField } from '@/components/ui/copy-field';
import { CheckIcon } from '@/components/ui/icons';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useTransferStatus } from '@/lib/use-transfer-status';

export function UploadResult({
  result,
  onReset,
}: {
  result: CreateTransferResponse;
  onReset: () => void;
}) {
  const { state } = useTransferStatus(result.transferId, result.manageToken);

  return (
    <Card className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckIcon />
        </span>
        <h1 className="text-xl font-bold">{t.result.title}</h1>
      </div>

      <FileSummary name={result.file.name} size={result.file.size} />

      {state.kind === 'loaded' && <TransferStatusAlert transfer={state.transfer} />}
      {state.kind === 'error' && <Alert tone="error">{t.common.error}</Alert>}

      <CopyField label={t.result.shareLink} value={result.shareUrl} hint={t.result.shareHint} />
      <CopyField label={t.result.manageLink} value={result.manageUrl} hint={t.result.manageHint} />

      <p className="text-sm text-muted">
        {t.result.expiresAt}:{' '}
        <span className="font-medium text-ink">{formatDateTime(result.expiresAt)}</span>
      </p>

      <p className="text-sm text-muted">
        {t.history.saved}{' '}
        <Link href="/history" className="font-medium text-brand-600 hover:underline">
          {t.nav.history}
        </Link>
      </p>

      <Button variant="secondary" block onClick={onReset}>
        {t.result.another}
      </Button>
    </Card>
  );
}
