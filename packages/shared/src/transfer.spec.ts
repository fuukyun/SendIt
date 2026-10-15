import { describe, expect, it } from 'vitest';
import { LIMITS } from './limits.js';
import { buildManageFragment, createTransferSchema, parseManageFragment } from './transfer.js';

describe('createTransferSchema', () => {
  it.each(['report.pdf', 'setup.exe', 'README', 'archive.tar.gz', 'Ảnh cưới.HEIC'])(
    'accepts any file type, such as %s',
    (name) => {
      expect(createTransferSchema.safeParse({ file: { name, size: 1 } }).success).toBe(true);
    },
  );

  it('defaults the expiry', () => {
    const parsed = createTransferSchema.parse({ file: { name: 'a', size: 1 } });
    expect(parsed.expiresInDays).toBe(LIMITS.defaultExpiryDays);
  });

  it.each([
    ['an empty name', { name: '   ', size: 1 }],
    ['an empty file', { name: 'a.txt', size: 0 }],
    ['a file over the size limit', { name: 'a.txt', size: LIMITS.maxFileBytes + 1 }],
  ])('rejects %s', (_, file) => {
    expect(createTransferSchema.safeParse({ file }).success).toBe(false);
  });
});

describe('manage fragment', () => {
  it('round-trips both tokens', () => {
    const fragment = buildManageFragment('manage_token', 'share-token');
    expect(parseManageFragment(`#${fragment}`)).toEqual({
      manageToken: 'manage_token',
      shareToken: 'share-token',
    });
  });

  it('rejects a fragment missing a token', () => {
    expect(parseManageFragment('#key=abc')).toBeNull();
  });
});
