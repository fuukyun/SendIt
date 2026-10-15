'use client';

import { LIMITS, type CreateTransferResponse } from '@sendit/shared';
import { useEffect, useRef, useState } from 'react';
import { FileSummary } from '@/components/file-summary';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { XIcon } from '@/components/ui/icons';
import { ProgressBar } from '@/components/ui/progress-bar';
import { api, ApiError } from '@/lib/api';
import { saveToHistory } from '@/lib/history';
import { t } from '@/lib/i18n';
import { uploadFile, type UploadProgress } from '@/lib/upload/uploader';
import { xhrPut } from '@/lib/upload/xhr-put';
import { Dropzone } from './dropzone';
import {
  DEFAULT_SETTINGS,
  settingsError,
  TransferOptions,
  type TransferSettings,
} from './transfer-options';
import { UploadResult } from './upload-result';

type Phase =
  | { kind: 'select' }
  | { kind: 'uploading'; progress: UploadProgress; bytesPerSecond: number | null }
  | { kind: 'done'; result: CreateTransferResponse };

function fileError(file: File): string | null {
  if (file.size === 0) return t.upload.empty;
  if (file.size > LIMITS.maxFileBytes) return t.upload.tooLarge;
  return null;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return t.upload.rateLimited(err.retryAfter);
    return err.message;
  }
  if (err instanceof TypeError) return t.common.networkError;
  return t.common.error;
}

export function UploadFlow() {
  const [file, setFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<TransferSettings>(DEFAULT_SETTINGS);
  const [phase, setPhase] = useState<Phase>({ kind: 'select' });
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const speed = useRef({ time: 0, loaded: 0, rate: null as number | null });

  const uploading = phase.kind === 'uploading';
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t.upload.leaveWarning;
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);

  function selectFiles(files: File[]) {
    setError(null);
    if (files.length > 1) return setError(t.upload.oneFileOnly);
    const picked = files[0];
    if (!picked) return;
    const problem = fileError(picked);
    if (problem) return setError(problem);
    setFile(picked);
  }

  /** Smoothed speed, so the remaining-time estimate does not jump around. */
  function trackSpeed(progress: UploadProgress): number | null {
    const now = performance.now();
    const s = speed.current;
    const elapsed = (now - s.time) / 1000;
    if (elapsed >= 0.5) {
      const instant = (progress.loaded - s.loaded) / elapsed;
      s.rate = s.rate === null ? instant : s.rate * 0.7 + instant * 0.3;
      s.time = now;
      s.loaded = progress.loaded;
    }
    return s.rate;
  }

  async function start() {
    if (!file) return;
    const problem = settingsError(settings);
    if (problem) return setError(problem);

    setError(null);
    controller.current = new AbortController();
    speed.current = { time: performance.now(), loaded: 0, rate: null };
    setPhase({
      kind: 'uploading',
      progress: { loaded: 0, total: file.size },
      bytesPerSecond: null,
    });

    try {
      const result = await uploadFile({
        api,
        put: xhrPut,
        file,
        signal: controller.current.signal,
        settings: {
          expiresInDays: settings.expiresInDays,
          maxDownloads: settings.maxDownloads ? Number(settings.maxDownloads) : undefined,
          password: settings.password || undefined,
          title: settings.title.trim() || undefined,
          message: settings.message.trim() || undefined,
        },
        onProgress: (progress) =>
          setPhase({ kind: 'uploading', progress, bytesPerSecond: trackSpeed(progress) }),
      });
      saveToHistory({
        transferId: result.transferId,
        manageToken: result.manageToken,
        shareUrl: result.shareUrl,
        manageUrl: result.manageUrl,
        fileName: result.file.name,
        size: result.file.size,
        title: settings.title.trim() || null,
        createdAt: new Date().toISOString(),
        expiresAt: result.expiresAt,
      });
      setPhase({ kind: 'done', result });
    } catch (err) {
      setPhase({ kind: 'select' });
      setError(controller.current?.signal.aborted ? t.upload.cancelled : errorMessage(err));
    }
  }

  function reset() {
    setFile(null);
    setSettings(DEFAULT_SETTINGS);
    setError(null);
    setPhase({ kind: 'select' });
  }

  if (phase.kind === 'done') return <UploadResult result={phase.result} onReset={reset} />;

  return (
    <Card className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t.upload.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.upload.subtitle}</p>
      </div>

      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
          <FileSummary name={file.name} size={file.size} />
          {!uploading && (
            <Button
              variant="ghost"
              onClick={() => setFile(null)}
              aria-label={t.upload.remove}
              className="px-2.5"
            >
              <XIcon />
            </Button>
          )}
        </div>
      ) : (
        <Dropzone onFiles={selectFiles} />
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {phase.kind === 'uploading' ? (
        <UploadingState
          progress={phase.progress}
          bytesPerSecond={phase.bytesPerSecond}
          onCancel={() => controller.current?.abort()}
        />
      ) : (
        <>
          <TransferOptions value={settings} onChange={setSettings} />
          <Button block disabled={!file} onClick={start}>
            {t.upload.submit}
          </Button>
        </>
      )}
    </Card>
  );
}

function UploadingState({
  progress,
  bytesPerSecond,
  onCancel,
}: {
  progress: UploadProgress;
  bytesPerSecond: number | null;
  onCancel: () => void;
}) {
  const fraction = progress.total ? progress.loaded / progress.total : 0;
  const remaining =
    bytesPerSecond && bytesPerSecond > 0
      ? (progress.total - progress.loaded) / bytesPerSecond
      : null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{t.upload.uploading}</span>
        <span className="font-mono tabular-nums">{Math.floor(fraction * 100)}%</span>
      </div>
      <ProgressBar value={fraction} label={t.upload.uploading} />
      <div className="flex justify-between text-xs text-muted tabular-nums">
        <span>{bytesPerSecond ? t.upload.speed(bytesPerSecond) : '…'}</span>
        <span>{remaining !== null ? t.upload.remaining(remaining) : ''}</span>
      </div>
      <Button variant="secondary" block onClick={onCancel}>
        {t.upload.cancel}
      </Button>
    </div>
  );
}
