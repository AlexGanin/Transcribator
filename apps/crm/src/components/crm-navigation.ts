export type AppView = 'transcribe' | 'videos' | 'download' | 'compress' | 'history';

export interface CrmNavigationItem {
  id: AppView;
  href: string;
  label: string;
}

export const crmNavigationItems: CrmNavigationItem[] = [
  { id: 'transcribe', href: '/', label: 'Транскрибатор' },
  { id: 'videos', href: '/videos', label: 'Видео' },
  { id: 'download', href: '/download', label: 'Скачать видео' },
  { id: 'compress', href: '/compress', label: 'Сжать видео' },
  { id: 'history', href: '/history', label: 'История' }
];

export function buildHistoryDetailPath(id: string): string {
  return `/history/${encodeURIComponent(id)}`;
}
