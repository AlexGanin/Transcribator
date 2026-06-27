export type AppView = 'transcribe' | 'videos' | 'videoDetail' | 'download' | 'compress' | 'history';

export interface CrmNavigationItem {
  id: AppView;
  href: string;
  label: string;
}

export const crmNavigationItems: CrmNavigationItem[] = [
  { id: 'videos', href: '/videos', label: 'Видео' },
  { id: 'transcribe', href: '/', label: 'Транскрибатор' },
  { id: 'download', href: '/download', label: 'Скачать видео' },
  { id: 'compress', href: '/compress', label: 'Сжать видео' },
  { id: 'history', href: '/history', label: 'История' }
];

export function buildHistoryDetailPath(id: string): string {
  return `/history/${encodeURIComponent(id)}`;
}

export function buildVideoDetailPath(id: string): string {
  return `/videos/${encodeURIComponent(id)}`;
}
