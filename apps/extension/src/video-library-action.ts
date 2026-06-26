import type { YouTubeVideoCreateRequest } from '@transcribator/shared';
import { buildYouTubeThumbnailUrl, buildYouTubeWatchUrl, extractYouTubeVideoId } from './youtube-video.js';

export const ADD_VIDEO_BUTTON_LABEL = 'Добавить видео';

export interface YouTubeVideoActionSource {
  url: string;
  title?: string | undefined;
}

export function buildYouTubeVideoCreateInput(source: YouTubeVideoActionSource): YouTubeVideoCreateRequest | null {
  const youtubeVideoId = extractYouTubeVideoId(source.url);
  if (!youtubeVideoId) return null;

  return {
    url: buildYouTubeWatchUrl(youtubeVideoId),
    title: cleanYouTubeTitle(source.title),
    channelTitle: '',
    thumbnailUrl: buildYouTubeThumbnailUrl(youtubeVideoId)
  };
}

function cleanYouTubeTitle(value: string | undefined): string {
  return String(value || '').replace(/\s+-\s+YouTube$/i, '').trim();
}
