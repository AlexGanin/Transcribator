export type AppView = 'transcribe' | 'download' | 'compress' | 'history';

export interface CrmNavigationItem {
  id: AppView;
  href: string;
  label: string;
}

export const crmNavigationItems: CrmNavigationItem[] = [
  { id: 'transcribe', href: '/', label: 'Транскрибатор' },
  { id: 'download', href: '/download', label: 'Скачать видео' },
  { id: 'compress', href: '/compress', label: 'Сжать видео' },
  { id: 'history', href: '/history', label: 'История' }
];

export function buildHistoryDetailPath(id: string): string {
  return `/history/${encodeURIComponent(id)}`;
}
