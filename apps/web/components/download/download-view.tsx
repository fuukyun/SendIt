'use client';

import type { TransferInfo } from '@sendit/shared';
import { useCallback, useEffect, useState } from 'react';
import { FileSummary } from '@/components/file-summary';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DownloadIcon, Spinner } from '@/components/ui/icons';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { PasswordForm } from './password-form';

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error' }
  | { kind: 'locked' }
  | { kind: 'ready'; info: TransferInfo };

/** Unlocking survives a reload for the token's lifetime, but not the browser session. */
const accessKey = (shareToken: string) => `sendit:access:${shareToken}`;

function readAccessToken(shareToken: string): string | undefined {
  try {
    return sessionStorage.getItem(accessKey(shareToken)) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeAccessToken(shareToken: string, token: string) {
  try {
    sessionStorage.setItem(accessKey(shareToken), token);
  } catch {
    // Storage unavailable (private mode); unlocking simply will not survive a reload.
  }
}

export function DownloadView({ shareToken }: { shareToken: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [accessToken, setAccessToken] = useState<string | undefined>();
  const [download, setDownload] = useState<'idle' | 'starting' | 'started' | 'failed'>('idle');

  const load = useCallback(
    async (token: string | undefined) => {
      try {
        const info = await api.getDownloadInfo(shareToken, token);
        setState(info.requiresPassword ? { kind: 'locked' } : { kind: 'ready', info });
      } catch (err) {
        setState(
          err instanceof ApiError && err.status === 404
            ? { kind: 'unavailable' }
            : { kind: 'error' },
        );
      }
    },
    [shareToken],
  );

  useEffect(() => {
    const stored = readAccessToken(shareToken);
    setAccessToken(stored);
    void load(stored);
  }, [shareToken, load]);

  function unlocked(token: string) {
    storeAccessToken(shareToken, token);
    setAccessToken(token);
    void load(token);
  }

  async function startDownload(info: TransferInfo) {
    setDownload('starting');
    try {
      const { url } = await api.createDownloadUrl(shareToken, accessToken);
      // Storage answers with Content-Disposition: attachment, so the page stays put.
      window.location.assign(url);
      setDownload('started');
      setState({
        kind: 'ready',
        info: {
          ...info,
          downloadsRemaining: info.downloadsRemaining === null ? null : info.downloadsRemaining - 1,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState({ kind: 'unavailable' });
      else setDownload('failed');
    }
  }

  switch (state.kind) {
    case 'loading':
      return (
        <Card className="flex items-center justify-center gap-3 py-16 text-muted">
          <Spinner /> {t.download.loading}
        </Card>
      );
    case 'unavailable':
      return (
        <Card>
          <Alert tone="info" title={t.download.unavailableTitle}>
            {t.download.unavailable}
          </Alert>
        </Card>
      );
    case 'error':
      return (
        <Card>
          <Alert tone="error">{t.common.error}</Alert>
        </Card>
      );
    case 'locked':
      return <PasswordForm shareToken={shareToken} onUnlocked={unlocked} />;
    case 'ready': {
      const { info } = state;
      const exhausted = info.downloadsRemaining !== null && info.downloadsRemaining <= 0;
      return (
        <Card className="space-y-6">
          {info.title && <h1 className="text-xl font-bold break-words">{info.title}</h1>}
          {info.message && (
            <p className="whitespace-pre-line break-words rounded-xl bg-subtle px-4 py-3 text-sm">
              {info.message}
            </p>
          )}
          <FileSummary name={info.file.name} size={info.file.size} />
          <Alert tone="warning">{t.download.notScanned}</Alert>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-subtle px-3 py-2.5">
              <dt className="text-muted">{t.download.expires}</dt>
              <dd className="font-medium">{formatDateTime(info.expiresAt)}</dd>
            </div>
            <div className="rounded-xl bg-subtle px-3 py-2.5">
              <dt className="text-muted">{t.manage.downloads}</dt>
              <dd className="font-medium">{t.download.downloadsLeft(info.downloadsRemaining)}</dd>
            </div>
          </dl>

          {download === 'started' && <Alert tone="success">{t.download.started}</Alert>}
          {download === 'failed' && <Alert tone="error">{t.download.failed}</Alert>}

          <Button
            block
            disabled={download === 'starting' || exhausted}
            onClick={() => startDownload(info)}
          >
            {download === 'starting' ? <Spinner /> : <DownloadIcon />}
            {download === 'starting' ? t.download.starting : t.download.download}
          </Button>
        </Card>
      );
    }
  }
}
