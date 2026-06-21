export const DEFAULT_MAX_UPLOAD_SIZE_GB = 20;

type UploadLimitEnv = Record<string, string | undefined>;

export function getMaxUploadSizeGb(env: UploadLimitEnv = process.env): number {
  return parsePositiveNumber(env.MAX_UPLOAD_SIZE_GB, DEFAULT_MAX_UPLOAD_SIZE_GB);
}

export function getMaxUploadSizeBytes(env: UploadLimitEnv = process.env): number {
  return Math.floor(getMaxUploadSizeGb(env) * 1024 ** 3);
}

export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return `${Number(gb.toFixed(2))} GiB`;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
