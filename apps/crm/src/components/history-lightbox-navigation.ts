export type LightboxDirection = 'previous' | 'next';

export function getAdjacentLightboxIndex(
  currentIndex: number,
  totalItems: number,
  direction: LightboxDirection
): number | null {
  if (totalItems <= 0) return null;
  if (totalItems === 1) return 0;

  const normalizedIndex = normalizeIndex(currentIndex, totalItems);
  return direction === 'previous'
    ? (normalizedIndex - 1 + totalItems) % totalItems
    : (normalizedIndex + 1) % totalItems;
}

export function chooseNextLightboxIndex(currentIndex: number, totalItemsBeforeDelete: number): number | null {
  if (totalItemsBeforeDelete <= 1) return null;

  const normalizedIndex = normalizeIndex(currentIndex, totalItemsBeforeDelete);
  return normalizedIndex >= totalItemsBeforeDelete - 1
    ? totalItemsBeforeDelete - 2
    : normalizedIndex;
}

function normalizeIndex(index: number, totalItems: number): number {
  if (!Number.isFinite(index) || totalItems <= 0) return 0;
  return Math.max(0, Math.min(totalItems - 1, Math.floor(index)));
}
