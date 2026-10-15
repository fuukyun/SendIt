'use client';

import { useId, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LockIcon } from '@/components/ui/icons';
import { api, ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';

export function PasswordForm({
  shareToken,
  onUnlocked,
}: {
  shareToken: string;
  onUnlocked: (accessToken: string) => void;
}) {
  const id = useId();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { accessToken } = await api.unlock(shareToken, password);
      onUnlocked(accessToken);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError(t.download.wrongPassword);
      else if (err instanceof ApiError && err.status === 429)
        setError(t.download.lockedOut(err.retryAfter ?? 900));
      else setError(t.common.error);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-brand-50 text-brand-600">
            <LockIcon />
          </span>
          <h1 className="text-lg font-bold">{t.download.lockedTitle}</h1>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={id} className="text-sm font-medium">
            {t.download.passwordLabel}
          </label>
          <input
            id={id}
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-2 focus:outline-brand-500/30"
          />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" block disabled={busy || !password}>
          {t.download.unlock}
        </Button>
      </form>
    </Card>
  );
}
