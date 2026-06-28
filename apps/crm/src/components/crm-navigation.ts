export type AppView = 'transcribe' | 'videos' | 'videoDetail' | 'download' | 'compress';

export interface CrmNavigationItem {
  id: AppView;
  href: string;
  label: string;
}

export const crmNavigationItems: CrmNavigationItem[] = [
  { id: 'videos', href: '/videos', label: 'Видео' },
  { id: 'transcribe', href: '/', label: 'Транскрибатор' },
  { id: 'download', href: '/download', label: 'Скачать видео' },
  { id: 'compress', href: '/compress', label: 'Сжать видео' }
];

export function buildVideoDetailPath(id: string): string {
  return `/videos/${encodeURIComponent(id)}`;
}
