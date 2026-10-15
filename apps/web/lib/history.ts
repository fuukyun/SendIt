'use client';

import { useSyncExternalStore } from 'react';

/**
 * Transfers sent from this browser, kept in localStorage so people can find their links again
 * without an account. Each entry holds the manage token, so anyone with access to this browser
 * profile can manage these transfers; the history page lets users clear it.
 */
export interface HistoryEntry {
  transferId: string;
  manageToken: string;
  shareUrl: string;
  manageUrl: string;
  fileName: string;
  size: number;
  title: string | null;
  createdAt: string;
  expiresAt: string;
}

const STORAGE_KEY = 'sendit:history:v1';
export const MAX_HISTORY_ENTRIES = 50;
const EMPTY: readonly HistoryEntry[] = [];

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // blocked (e.g. privacy settings)
  }
}

function isEntry(value: unknown): value is HistoryEntry {
  const e = value as Partial<HistoryEntry> | null;
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof e.transferId === 'string' &&
    typeof e.manageToken === 'string' &&
    typeof e.shareUrl === 'string' &&
    typeof e.manageUrl === 'string' &&
    typeof e.fileName === 'string' &&
    typeof e.size === 'number' &&
    typeof e.createdAt === 'string' &&
    typeof e.expiresAt === 'string'
  );
}

// Parsed once per stored string, so useSyncExternalStore sees a stable snapshot.
let cachedRaw: string | null = null;
let cachedEntries: readonly HistoryEntry[] = EMPTY;

/** Newest first. Malformed or foreign data is ignored rather than breaking the page. */
export function readHistory(): readonly HistoryEntry[] {
  let raw: string | null;
  try {
    raw = storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedEntries;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedEntries = Array.isArray(parsed) ? parsed.filter(isEntry) : EMPTY;
  } catch {
    cachedEntries = EMPTY;
  }
  return cachedEntries;
}

const listeners = new Set<() => void>();

function write(entries: readonly HistoryEntry[]) {
  try {
    const store = storage();
    if (!store) return;
    if (entries.length === 0) store.removeItem(STORAGE_KEY);
    else store.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or storage blocked: history is a convenience, never an error for the user.
  }
  listeners.forEach((notify) => notify());
}

/** Adds or refreshes an entry and moves it to the top. */
export function saveToHistory(entry: HistoryEntry) {
  const others = readHistory().filter((e) => e.transferId !== entry.transferId);
  write([entry, ...others].slice(0, MAX_HISTORY_ENTRIES));
}

export function removeFromHistory(transferId: string) {
  write(readHistory().filter((e) => e.transferId !== transferId));
}

export function clearHistory() {
  write(EMPTY);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Keeps other open tabs in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** The history, re-rendering on changes from this tab or others. Empty during server rendering. */
export function useHistory(): readonly HistoryEntry[] {
  return useSyncExternalStore(subscribe, readHistory, () => EMPTY);
}
