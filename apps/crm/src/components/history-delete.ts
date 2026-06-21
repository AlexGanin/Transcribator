import type { HistoryEntry } from '@transcribator/shared';

type HistoryDeleteEntry = Pick<HistoryEntry, 'id' | 'title' | 'source'>;

export function buildHistoryDeleteConfirmationMessage(entry: HistoryDeleteEntry): string {
  const title = entry.title || entry.source || entry.id;
  return `Удалить запись истории «${title}»? Будут удалены запись, Markdown и скриншоты. Исходные загруженные медиа останутся на месте.`;
}
