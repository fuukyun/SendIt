import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearHistory,
  MAX_HISTORY_ENTRIES,
  readHistory,
  removeFromHistory,
  saveToHistory,
  type HistoryEntry,
} from './history';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, value);
  removeItem = (key: string) => void this.data.delete(key);
}

const entry = (id: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  transferId: id,
  manageToken: `token-${id}`,
  shareUrl: `http://web/d/${id}`,
  manageUrl: `http://web/t/${id}/manage#key=x&share=y`,
  fileName: `${id}.zip`,
  size: 10,
  title: null,
  createdAt: '2026-10-14T00:00:00.000Z',
  expiresAt: '2026-10-21T00:00:00.000Z',
  ...overrides,
});

let store: MemoryStorage;

beforeEach(() => {
  store = new MemoryStorage();
  vi.stubGlobal('localStorage', store);
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

describe('history', () => {
  it('starts empty', () => {
    expect(readHistory()).toEqual([]);
  });

  it('keeps the newest entry first and refreshes duplicates', () => {
    saveToHistory(entry('a'));
    saveToHistory(entry('b'));
    saveToHistory(entry('a', { title: 'again' }));

    expect(readHistory().map((e) => [e.transferId, e.title])).toEqual([
      ['a', 'again'],
      ['b', null],
    ]);
  });

  it(`keeps at most ${MAX_HISTORY_ENTRIES} entries`, () => {
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) saveToHistory(entry(`t${i}`));
    const ids = readHistory().map((e) => e.transferId);
    expect(ids).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(ids[0]).toBe(`t${MAX_HISTORY_ENTRIES + 4}`);
    expect(ids).not.toContain('t0');
  });

  it('removes one entry or everything', () => {
    saveToHistory(entry('a'));
    saveToHistory(entry('b'));
    removeFromHistory('a');
    expect(readHistory().map((e) => e.transferId)).toEqual(['b']);

    clearHistory();
    expect(readHistory()).toEqual([]);
    expect(store.getItem('sendit:history:v1')).toBeNull();
  });

  it('ignores corrupted or foreign data', () => {
    store.setItem('sendit:history:v1', 'not json');
    expect(readHistory()).toEqual([]);

    store.setItem('sendit:history:v1', JSON.stringify([entry('ok'), { transferId: 1 }, null]));
    expect(readHistory().map((e) => e.transferId)).toEqual(['ok']);
  });

  it('works when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readHistory()).toEqual([]);
    expect(() => saveToHistory(entry('a'))).not.toThrow();
  });
});
