import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  screenshotFileNameSchema,
  type UpdateYouTubeVideoTranscriptRequest,
  type VideoScreenshot,
  type VideoScreenshotScope,
  type VideoScreenshotsRequest,
  type YouTubeVideo,
  type YouTubeVideoScreenshotsOperationResponse,
  type YouTubeVideoTranscriptResponse
} from '@transcribator/shared';
import { createHttpError } from './errors.js';
import { DEFAULT_RUNTIME_DIR } from './runtimePaths.js';
import { defaultVideoLibraryStore, type VideoLibraryStore } from './videoLibrary.js';

export interface VideoArtifactsServiceOptions {
  store?: VideoLibraryStore | undefined;
  runtimeDir?: string | undefined;
}

export interface VideoArtifactsService {
  updateTranscript(id: string, patch: UpdateYouTubeVideoTranscriptRequest): Promise<YouTubeVideoTranscriptResponse>;
  formatWithAi(id: string): Promise<YouTubeVideoTranscriptResponse>;
  createMarkdown(id: string): Promise<YouTubeVideoTranscriptResponse>;
  trashScreenshots(id: string, payload: VideoScreenshotsRequest): Promise<YouTubeVideoScreenshotsOperationResponse>;
  restoreScreenshots(id: string, payload: VideoScreenshotsRequest): Promise<YouTubeVideoScreenshotsOperationResponse>;
  clearScreenshotsTrash(id: string): Promise<YouTubeVideoScreenshotsOperationResponse>;
  getScreenshotPath(id: string, scope: VideoScreenshotScope, fileName: string): Promise<string>;
}

export const videoArtifactsService = createVideoArtifactsService({
  store: defaultVideoLibraryStore,
  runtimeDir: DEFAULT_RUNTIME_DIR
});

export function createVideoArtifactsService(options: VideoArtifactsServiceOptions = {}): VideoArtifactsService {
  const store = options.store || defaultVideoLibraryStore;
  const runtimeDir = options.runtimeDir || DEFAULT_RUNTIME_DIR;

  return {
    async updateTranscript(id, patch) {
      return { video: store.updateTranscript(id, patch) };
    },

    async formatWithAi(id) {
      const video = requireVideo(store, id);
      await delay(800);
      return {
        video: store.updateTranscript(id, {
          formattedText: video.formattedText || video.cleanText || video.rawText,
          summary: video.summary
        })
      };
    },

    async createMarkdown(id) {
      const video = requireVideo(store, id);
      const artifactDir = path.join(runtimeDir, 'artifacts', video.id);
      const markdownPath = path.join(artifactDir, 'transcript.md');
      await mkdir(artifactDir, { recursive: true });
      await writeFile(markdownPath, buildVideoMarkdown(video), 'utf8');
      return { video: store.updateTranscript(video.id, { markdownPath }) };
    },

    async trashScreenshots(id, payload) {
      const result = await moveScreenshots({
        store,
        runtimeDir,
        videoId: id,
        fileNames: payload.fileNames,
        from: 'active',
        to: 'trash'
      });
      return { video: requireVideo(store, id), moved: result.moved, missing: result.missing, deleted: [] };
    },

    async restoreScreenshots(id, payload) {
      const result = await moveScreenshots({
        store,
        runtimeDir,
        videoId: id,
        fileNames: payload.fileNames,
        from: 'trash',
        to: 'active'
      });
      return { video: requireVideo(store, id), moved: result.moved, missing: result.missing, deleted: [] };
    },

    async clearScreenshotsTrash(id) {
      const video = requireVideo(store, id);
      const deleted: string[] = [];

      for (const screenshot of video.trashedScreenshots) {
        await rm(screenshotPath(runtimeDir, video.id, 'trash', screenshot.fileName), { force: true });
        deleted.push(screenshot.fileName);
      }

      return {
        video: store.setScreenshots(video.id, video.screenshots, []),
        moved: [],
        missing: [],
        deleted
      };
    },

    async getScreenshotPath(id, scope, fileName) {
      const video = requireVideo(store, id);
      const safeName = screenshotFileNameSchema.parse(fileName);
      const screenshot = screenshotsForScope(video, scope).find((item) => item.fileName === safeName);
      if (!screenshot) {
        throw createHttpError(404, 'Screenshot not found.');
      }

      const safePath = assertInside(
        path.resolve(runtimeDir),
        path.resolve(screenshotPath(runtimeDir, video.id, scope, safeName))
      );

      if (!await fileExists(safePath)) {
        throw createHttpError(404, 'Screenshot file is missing.');
      }

      return safePath;
    }
  };
}

interface MoveScreenshotsOptions {
  store: VideoLibraryStore;
  runtimeDir: string;
  videoId: string;
  fileNames: string[];
  from: VideoScreenshotScope;
  to: VideoScreenshotScope;
}

async function moveScreenshots(options: MoveScreenshotsOptions): Promise<{ moved: string[]; missing: string[] }> {
  const video = requireVideo(options.store, options.videoId);
  const active = [...video.screenshots];
  const trash = [...video.trashedScreenshots];
  const moved: string[] = [];
  const missing: string[] = [];

  for (const fileName of options.fileNames) {
    const safeName = screenshotFileNameSchema.parse(fileName);
    const fromList = options.from === 'active' ? active : trash;
    const toList = options.to === 'active' ? active : trash;
    const index = fromList.findIndex((screenshot) => screenshot.fileName === safeName);

    if (index < 0) {
      missing.push(safeName);
      continue;
    }

    const [screenshot] = fromList.splice(index, 1);
    if (!screenshot) continue;

    const previousPath = screenshotPath(options.runtimeDir, video.id, options.from, safeName);
    const nextPath = screenshotPath(options.runtimeDir, video.id, options.to, safeName);
    await mkdir(path.dirname(nextPath), { recursive: true });

    if (await fileExists(previousPath)) {
      await rename(previousPath, nextPath);
    } else {
      missing.push(safeName);
    }

    toList.push(screenshot);
    moved.push(safeName);
  }

  options.store.setScreenshots(video.id, sortScreenshots(active), sortScreenshots(trash));
  return { moved, missing };
}

function buildVideoMarkdown(video: YouTubeVideo): string {
  const sections = [
    `# ${video.title || video.url || 'Transcribator transcript'}`,
    '',
    '## Метаданные',
    '',
    `- YouTube URL: \`${video.webpageUrl || video.url}\``,
    `- YouTube ID: \`${video.youtubeVideoId}\``,
    `- Channel: \`${video.channelTitle || video.uploader || 'unknown'}\``,
    `- Engine: \`${video.transcriptionEngine || 'unknown'}\``,
    `- Created at: \`${new Date(video.transcriptionStartedAt || video.createdAt).toISOString()}\``
  ];

  if (normalizeMarkdownText(video.summary)) {
    sections.push('', '## Краткое содержание', '', formatTranscriptMarkdown(video.summary));
  }

  sections.push('', '## Скриншоты', '', formatScreenshotsMarkdown(video.screenshots));
  sections.push('', '## Транскрипция', '', formatTranscriptMarkdown(bestTranscriptText(video)), '');
  return sections.join('\n');
}

function bestTranscriptText(video: Pick<YouTubeVideo, 'formattedText' | 'cleanText' | 'rawText'>): string {
  return video.formattedText || video.cleanText || video.rawText || '';
}

function formatScreenshotsMarkdown(screenshots: VideoScreenshot[]): string {
  if (screenshots.length === 0) {
    return 'Скриншоты не созданы.';
  }

  return sortScreenshots(screenshots)
    .map((screenshot) => [
      `![[screenshots/${screenshot.fileName}]]`,
      '',
      `\`${formatTimestamp(screenshot.timestampSeconds)}\``
    ].join('\n'))
    .join('\n\n');
}

function formatTranscriptMarkdown(text: string): string {
  const normalized = normalizeMarkdownText(text);
  if (!normalized) {
    return 'Нет текста.';
  }

  return normalized
    .split(/\n{2,}/)
    .flatMap(formatTranscriptBlock)
    .join('\n\n');
}

function formatTranscriptBlock(block: string): string[] {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  if (lines.some((line) => /^#{1,6}\s/.test(line))) {
    return [lines.join('\n')];
  }

  if (lines.every((line) => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line))) {
    return [lines.join('\n')];
  }

  const sentences = lines.join(' ')
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 3) {
    return [sentences.join(' ')];
  }

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(' '));
  }
  return paragraphs;
}

function normalizeMarkdownText(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function screenshotsForScope(video: YouTubeVideo, scope: VideoScreenshotScope): VideoScreenshot[] {
  return scope === 'active' ? video.screenshots : video.trashedScreenshots;
}

function screenshotPath(runtimeDir: string, videoId: string, scope: VideoScreenshotScope, fileName: string): string {
  const safeName = screenshotFileNameSchema.parse(fileName);
  return path.join(
    runtimeDir,
    'artifacts',
    videoId,
    scope === 'active' ? 'screenshots' : path.join('trash', 'screenshots'),
    safeName
  );
}

function sortScreenshots(screenshots: VideoScreenshot[]): VideoScreenshot[] {
  return [...screenshots].sort((left, right) => left.timestampSeconds - right.timestampSeconds || left.fileName.localeCompare(right.fileName));
}

function requireVideo(store: VideoLibraryStore, id: string): YouTubeVideo {
  const video = store.getVideoById(id);
  if (!video) {
    throw createHttpError(404, 'Видео не найдено.');
  }
  return video;
}

function assertInside(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw createHttpError(400, 'Invalid screenshot file path.');
  }
  return filePath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
