export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:2001';

const LEGACY_DEFAULT_API_BASE_URLS = new Set([
  'http://127.0.0.1:3001',
  'http://localhost:3001'
]);

export function normalizeApiBaseUrl(value: unknown, fallback = DEFAULT_API_BASE_URL): string {
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim().replace(/\/+$/, '');
  if (!normalized || LEGACY_DEFAULT_API_BASE_URLS.has(normalized)) {
    return fallback;
  }

  return normalized;
}
