const S3_MAX_PARTS = 10_000;

export type UploadPlan =
  { method: 'single' } | { method: 'multipart'; partSize: number; partCount: number };

export function planUpload(
  size: number,
  options: { thresholdBytes: number; partBytes: number },
): UploadPlan {
  if (size < options.thresholdBytes) return { method: 'single' };
  const partSize = Math.max(options.partBytes, Math.ceil(size / S3_MAX_PARTS));
  return { method: 'multipart', partSize, partCount: Math.ceil(size / partSize) };
}

/** Exact byte length of a part; every part but the last is `partSize` long. */
export function partLength(
  size: number,
  partSize: number,
  partCount: number,
  partNumber: number,
): number {
  return partNumber < partCount ? partSize : size - partSize * (partCount - 1);
}
