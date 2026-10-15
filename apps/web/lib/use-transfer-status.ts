'use client';

import type { TransferStatus, TransferStatusResponse } from '@sendit/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

const POLL_MS = 2000;
/** Changes without this page doing anything only while the upload (maybe in another tab) runs. */
const PENDING: TransferStatus[] = ['UPLOADING'];

export type TransferStatusState =
  | { kind: 'loading' }
  | { kind: 'loaded'; transfer: TransferStatusResponse }
  | { kind: 'not-found' }
  | { kind: 'error' };

/** The owner's view of a transfer, polled while the upload is unfinished. */
export function useTransferStatus(id: string | null, manageToken: string | null) {
  const [state, setState] = useState<TransferStatusState>({ kind: 'loading' });

  const refresh = useCallback(async () => {
    if (!id || !manageToken) return;
    try {
      setState({ kind: 'loaded', transfer: await api.getTransfer(id, manageToken) });
    } catch (err) {
      setState(
        err instanceof ApiError && err.status === 404 ? { kind: 'not-found' } : { kind: 'error' },
      );
    }
  }, [id, manageToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending = state.kind === 'loaded' && PENDING.includes(state.transfer.status);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [pending, refresh]);

  return { state, refresh };
}
