import { describe, expect, it } from 'vitest';
import { partLength, planUpload } from './upload-plan.js';

const MiB = 1024 * 1024;
const options = { thresholdBytes: 100 * MiB, partBytes: 16 * MiB };

describe('planUpload', () => {
  it('uses a single PUT below the threshold', () => {
    expect(planUpload(100 * MiB - 1, options)).toEqual({ method: 'single' });
  });

  it('splits larger files into parts', () => {
    expect(planUpload(100 * MiB, options)).toEqual({
      method: 'multipart',
      partSize: 16 * MiB,
      partCount: 7,
    });
  });

  it('grows the part size to stay within 10,000 parts', () => {
    const size = 200_000 * MiB;
    const plan = planUpload(size, options);
    expect(plan.method).toBe('multipart');
    if (plan.method !== 'multipart') return;
    expect(plan.partCount).toBeLessThanOrEqual(10_000);
    expect(plan.partSize * plan.partCount).toBeGreaterThanOrEqual(size);
  });
});

describe('partLength', () => {
  it('gives the remainder to the last part', () => {
    const size = 100 * MiB;
    const lengths = [1, 2, 3, 4, 5, 6, 7].map((n) => partLength(size, 16 * MiB, 7, n));
    expect(lengths.slice(0, 6)).toEqual(Array(6).fill(16 * MiB));
    expect(lengths[6]).toBe(4 * MiB);
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(size);
  });
});
