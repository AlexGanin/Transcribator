export interface YouTubeVideoMetadata {
  url: string;
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      return normalizeVideoId(parsed.pathname.split('/').filter(Boolean)[0]);
    }

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const watchId = normalizeVideoId(parsed.searchParams.get('v'));
      if (watchId) return watchId;

      const [kind, id] = parsed.pathname.split('/').filter(Boolean);
      if (kind === 'shorts' || kind === 'embed' || kind === 'live') {
        return normalizeVideoId(id);
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function buildYouTubeThumbnailUrl(youtubeVideoId: string): string {
  return `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
}

export function buildYouTubeWatchUrl(youtubeVideoId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeVideoId}`;
}

export function readYouTubeVideoMetadata(doc: Document = document, href: string = window.location.href): YouTubeVideoMetadata | null {
  const youtubeVideoId = extractYouTubeVideoId(href);
  if (!youtubeVideoId) return null;

  return {
    url: buildYouTubeWatchUrl(youtubeVideoId),
    youtubeVideoId,
    title: readTitle(doc),
    channelTitle: readChannelTitle(doc),
    thumbnailUrl: buildYouTubeThumbnailUrl(youtubeVideoId)
  };
}

function readTitle(doc: Document): string {
  const heading = doc.querySelector('h1.ytd-watch-metadata, h1.title');
  const text = heading?.textContent?.replace(/\s+/g, ' ').trim();
  if (text) return text;

  return doc.title.replace(/\s+-\s+YouTube$/i, '').trim();
}

function readChannelTitle(doc: Document): string {
  const ownerLink = doc.querySelector('#owner #channel-name a, ytd-video-owner-renderer #channel-name a');
  return ownerLink?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function normalizeVideoId(value: string | null | undefined): string | null {
  const trimmed = String(value || '').trim();
  return /^[A-Za-z0-9_-]{6,32}$/.test(trimmed) ? trimmed : null;
}
