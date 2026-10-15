import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration } from './format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1536, '1,5 KB'],
    [15 * 1024 * 1024, '15 MB'],
    [2 * 1024 ** 3, '2 GB'],
  ])('%d -> %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 giây'],
    [45, '45 giây'],
    [125, '2 phút'],
    [3600, '1 giờ'],
    [3900, '1 giờ 5 phút'],
  ])('%d -> %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
