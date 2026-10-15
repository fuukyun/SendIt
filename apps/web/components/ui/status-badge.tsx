import type { TransferStatus } from '@sendit/shared';
import { t } from '@/lib/i18n';

const TONES: Record<TransferStatus, string> = {
  UPLOADING: 'bg-subtle text-muted',
  READY: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  EXPIRED: 'bg-subtle text-muted',
  DELETED: 'bg-subtle text-muted',
};

export function StatusBadge({ status }: { status: TransferStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[status]}`}
    >
      {t.status.labels[status]}
    </span>
  );
}
