'use client';

import type { TransferStatusResponse } from '@sendit/shared';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { HistoryEntry } from './history';

export type EntryStatus =
  | { kind: 'loading' }
  | { kind: 'loaded'; transfer: TransferStatusResponse }
  | { kind: 'not-found' }
  | { kind: 'error' };

const CONCURRENCY = 4;
const POLL_MS = 3000;

async function fetchStatus(entry: HistoryEntry): Promise<EntryStatus> {
  try {
    return {
      kind: 'loaded',
      transfer: await api.getTransfer(entry.transferId, entry.manageToken),
    };
  } catch (err) {
    return err instanceof ApiError && err.status === 404
      ? { kind: 'not-found' }
      : { kind: 'error' };
  }
}

function isPending(status: EntryStatus | undefined): boolean {
  return status?.kind === 'loaded' && status.transfer.status === 'UPLOADING';
}

/** Live server status for each history entry; unfinished uploads are polled. */
export function useHistoryStatuses(entries: readonly HistoryEntry[]) {
  const [statuses, setStatuses] = useState<Record<string, EntryStatus>>({});
  const latest = useRef(statuses);
  latest.current = statuses;

  // Only re-run when the set of transfers changes, not on every history write.
  const ids = entries.map((e) => e.transferId).join(',');

  useEffect(() => {
    let cancelled = false;

    // A few requests at a time, so a long history does not burst the API's rate limit.
    const load = async (targets: readonly HistoryEntry[]) => {
      const queue = [...targets];
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          for (let entry = queue.shift(); entry; entry = queue.shift()) {
            const status = await fetchStatus(entry);
            if (!cancelled) setStatuses((prev) => ({ ...prev, [entry.transferId]: status }));
          }
        }),
      );
    };

    void load(entries);
    const timer = setInterval(() => {
      const pending = entries.filter((e) => isPending(latest.current[e.transferId]));
      if (pending.length) void load(pending);
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ids]);

  return statuses;
}
