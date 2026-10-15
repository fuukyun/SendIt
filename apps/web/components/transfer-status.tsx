import type { TransferStatusResponse } from '@sendit/shared';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/icons';
import { t } from '@/lib/i18n';

/** Explains the owner's transfer status in one alert. */
export function TransferStatusAlert({ transfer }: { transfer: TransferStatusResponse }) {
  const label = t.status.labels[transfer.status];
  switch (transfer.status) {
    case 'UPLOADING':
      return (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl bg-subtle px-4 py-3 text-sm"
        >
          <Spinner className="shrink-0 text-brand-600" />
          <div>
            <p className="font-semibold">{label}</p>
            <p className="text-muted">{t.status.uploading}</p>
          </div>
        </div>
      );
    case 'READY':
      return (
        <Alert tone="success" title={label}>
          {t.status.ready}
        </Alert>
      );
    case 'REJECTED':
      return (
        <Alert tone="error" title={label}>
          {t.status.rejected}
        </Alert>
      );
    case 'EXPIRED':
      return (
        <Alert tone="info" title={label}>
          {t.status.expired}
        </Alert>
      );
    case 'DELETED':
      return (
        <Alert tone="info" title={label}>
          {t.status.deleted}
        </Alert>
      );
  }
}
