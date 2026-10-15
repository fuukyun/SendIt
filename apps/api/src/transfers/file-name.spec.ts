import { describe, expect, it } from 'vitest';
import { sanitizeFileName } from './file-name.js';

describe('sanitizeFileName', () => {
  it.each([
    ['report.pdf', 'report.pdf'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\secret.txt', 'secret.txt'],
    ['in\u202Efdp.exe', 'infdp.exe'],
    ['a\u0000b\nc.txt', 'abc.txt'],
    ['what?<>.txt', 'what___.txt'],
    ['name. . .', 'name'],
    ['   ', 'file'],
    ['..', 'file'],
    ['Ảnh chụp màn hình.png', 'Ảnh chụp màn hình.png'],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it('caps the length', () => {
    expect(Array.from(sanitizeFileName('é'.repeat(400)))).toHaveLength(255);
  });
});
