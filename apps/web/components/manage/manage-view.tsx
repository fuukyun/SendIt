'use client';

import { parseManageFragment } from '@sendit/shared';
import { useEffect, useState } from 'react';
import { saveToHistory } from '@/lib/history';
import { FileSummary } from '@/components/file-summary';
import { TransferStatusAlert } from '@/components/transfer-status';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyField } from '@/components/ui/copy-field';
import { Spinner } from '@/components/ui/icons';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useTransferStatus } from '@/lib/use-transfer-status';

type Tokens = { manageToken: string; shareToken: string };

export function ManageView({ transferId }: { transferId: string }) {
  // The tokens live in the URL fragment, which only the browser can read.
  const [tokens, setTokens] = useState<Tokens | null | undefined>(undefined);
  useEffect(() => setTokens(parseManageFragment(window.location.hash)), []);

  if (tokens === undefined) return null;
  if (tokens === null) {
    return (
      <Card>
        <Alert tone="error">{t.manage.invalidLink}</Alert>
      </Card>
    );
  }
  return <ManagePanel transferId={transferId} tokens={tokens} />;
}

function ManagePanel({ transferId, tokens }: { transferId: string; tokens: Tokens }) {
  const { state, refresh } = useTransferStatus(transferId, tokens.manageToken);

  const loaded = state.kind === 'loaded' ? state.transfer : null;
  useEffect(() => {
    if (!loaded) return;
    saveToHistory({
      transferId,
      manageToken: tokens.manageToken,
      shareUrl: `${window.location.origin}/d/${tokens.shareToken}`,
      manageUrl: window.location.href,
      fileName: loaded.file.name,
      size: loaded.file.size,
      title: loaded.title,
      createdAt: loaded.createdAt,
      expiresAt: loaded.expiresAt,
    });
    // Saved once per transfer, not on every status poll.
  }, [loaded?.transferId]);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  async function remove() {
    if (!confirming) return setConfirming(true);
    setDeleting(true);
    setDeleteError(false);
    try {
      await api.deleteTransfer(transferId, tokens.manageToken);
      await refresh();
    } catch {
      setDeleteError(true);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (state.kind === 'loading') {
    return (
      <Card className="flex justify-center py-16 text-muted">
        <Spinner />
      </Card>
    );
  }
  if (state.kind !== 'loaded') {
    return (
      <Card>
        <Alert tone="error">
          {state.kind === 'not-found' ? t.manage.notFound : t.common.error}
        </Alert>
      </Card>
    );
  }

  const { transfer } = state;
  const shareUrl = `${window.location.origin}/d/${tokens.shareToken}`;
  const removable = !['DELETED', 'EXPIRED'].includes(transfer.status);

  return (
    <Card className="space-y-6">
      <h1 className="text-xl font-bold">{transfer.title || t.manage.title}</h1>
      <FileSummary name={transfer.file.name} size={transfer.file.size} />
      <TransferStatusAlert transfer={transfer} />

      {transfer.status === 'READY' && <CopyField label={t.result.shareLink} value={shareUrl} />}

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-subtle px-3 py-2.5">
          <dt className="text-muted">{t.manage.downloads}</dt>
          <dd className="font-medium tabular-nums">
            {t.manage.downloadsValue(transfer.downloadCount, transfer.maxDownloads)}
          </dd>
        </div>
        <div className="rounded-xl bg-subtle px-3 py-2.5">
          <dt className="text-muted">{t.result.expiresAt}</dt>
          <dd className="font-medium">{formatDateTime(transfer.expiresAt)}</dd>
        </div>
        <div className="col-span-2 rounded-xl bg-subtle px-3 py-2.5">
          <dt className="text-muted">{t.manage.created}</dt>
          <dd className="font-medium">{formatDateTime(transfer.createdAt)}</dd>
        </div>
      </dl>

      {deleteError && <Alert tone="error">{t.manage.deleteFailed}</Alert>}
      {removable && (
        <Button
          variant={confirming ? 'danger' : 'secondary'}
          block
          disabled={deleting}
          onClick={remove}
          onBlur={() => setConfirming(false)}
        >
          {deleting ? t.manage.deleting : confirming ? t.manage.confirmDelete : t.manage.delete}
        </Button>
      )}
    </Card>
  );
}
