export const ALL_YOUTUBE_CHANNELS_ID = 'all';
export const UNCATEGORIZED_YOUTUBE_CHANNEL_ID = '__uncategorized__';
export const DEFAULT_TRANSCRIPTION_SOURCE_ID = '__transcriptions__';
export const DEFAULT_TRANSCRIPTION_SOURCE_LABEL = 'Транскрибации';

export interface YouTubeChannelFilter {
  id: string;
  label: string;
  count: number;
}

export interface YouTubeChannelVideo {
  sourceType?: 'youtube' | 'file' | undefined;
  channelTitle?: string | undefined;
  uploader?: string | undefined;
}

export function buildYouTubeChannelFilters<T extends YouTubeChannelVideo>(videos: T[]): YouTubeChannelFilter[] {
  const byChannel = new Map<string, YouTubeChannelFilter>();

  for (const video of videos) {
    const channel = getYouTubeVideoChannel(video);
    const existing = byChannel.get(channel.id);
    if (existing) {
      existing.count += 1;
    } else {
      byChannel.set(channel.id, { ...channel, count: 1 });
    }
  }

  return [
    { id: ALL_YOUTUBE_CHANNELS_ID, label: 'Все видео', count: videos.length },
    ...[...byChannel.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'))
  ];
}

export function filterYouTubeVideosByChannel<T extends YouTubeChannelVideo>(videos: T[], channelId: string): T[] {
  if (!channelId || channelId === ALL_YOUTUBE_CHANNELS_ID) return videos;
  return videos.filter((video) => getYouTubeVideoChannel(video).id === channelId);
}

function getYouTubeVideoChannel(video: YouTubeChannelVideo): Pick<YouTubeChannelFilter, 'id' | 'label'> {
  const label = normalizeChannelLabel(video.channelTitle) || normalizeChannelLabel(video.uploader);
  if (!label && video.sourceType === 'file') {
    return { id: DEFAULT_TRANSCRIPTION_SOURCE_ID, label: DEFAULT_TRANSCRIPTION_SOURCE_LABEL };
  }

  if (!label) {
    return { id: UNCATEGORIZED_YOUTUBE_CHANNEL_ID, label: 'Без канала' };
  }

  return { id: label.toLocaleLowerCase('ru'), label };
}

function normalizeChannelLabel(value: string | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
