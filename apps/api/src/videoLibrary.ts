import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createHttpError } from './errors.js';
import { DEFAULT_DB_PATH } from './runtimePaths.js';
import { normalizeFormats } from './videoDownload.js';
import type { CommandResult, YtDlpVideoFormatObject } from './types.js';
import type {
  TranscriptionResult,
  UpdateYouTubeVideoTranscriptRequest,
  VideoSourceType,
  VideoFormat,
  VideoScreenshot,
  YouTubeVideo,
  YouTubeVideoCreateRequest,
  YouTubeVideoDetailResponse
} from '@transcribator/shared';

export interface VideoLibraryStoreOptions {
  dbPath?: string | undefined;
  now?: (() => number) | undefined;
  metadataFetcher?: YouTubeVideoMetadataFetcher | undefined;
}

export interface AddYouTubeVideoResult {
  video: YouTubeVideo;
  alreadyAdded: boolean;
}

export interface CheckYouTubeVideoResult {
  added: boolean;
  video?: YouTubeVideo | undefined;
}

export interface LocalVideoCreateRequest {
  originalFileName: string;
  sourcePath: string;
  title?: string | undefined;
}

export type YouTubeVideoMetadataFetcher = (url: string) => Promise<YouTubeVideoMetadata>;
export type VideoTranscriptPatch = UpdateYouTubeVideoTranscriptRequest & {
  markdownPath?: string | undefined;
  transcriptionEngine?: string | undefined;
  transcriptionFinishedAt?: number | null | undefined;
};

const DEFAULT_LIST_METADATA_ENRICHMENT_LIMIT = 20;
const DEFAULT_TRANSCRIPTION_SOURCE_LABEL = 'Транскрибации';

export interface YouTubeVideoMetadata {
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  channelUrl: string;
  uploader: string;
  uploaderId: string;
  uploaderUrl: string;
  durationSeconds: number | null;
  durationLabel: string;
  uploadDate: string;
  timestamp: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  categories: string[];
  tags: string[];
  language: string;
  availability: string;
  liveStatus: string;
  ageLimit: number | null;
  thumbnailUrl: string;
  webpageUrl: string;
  formats: VideoFormat[];
  rawMetadataJson: string;
}

export class VideoLibraryStore {
  readonly dbPath: string;
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly metadataFetcher: YouTubeVideoMetadataFetcher;

  constructor(options: VideoLibraryStoreOptions = {}) {
    this.dbPath = options.dbPath || DEFAULT_DB_PATH;
    this.now = options.now || Date.now;
    this.metadataFetcher = options.metadataFetcher || fetchYouTubeVideoMetadata;
    mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.ensureSchema();
  }

  close(): void {
    this.db.close();
  }

  addVideo(input: YouTubeVideoCreateRequest): AddYouTubeVideoResult {
    const youtubeVideoId = extractYouTubeVideoId(input.url);

    if (!youtubeVideoId) {
      throw createHttpError(400, 'Поддерживаются только ссылки YouTube.');
    }

    const existing = this.getByYouTubeVideoId(youtubeVideoId);
    const now = this.now();

    if (existing) {
      const next = {
        ...existing,
        url: normalizeYouTubeWatchUrl(youtubeVideoId),
        title: normalizeText(input.title) || existing.title,
        channelTitle: normalizeText(input.channelTitle) || existing.channelTitle,
        thumbnailUrl: normalizeText(input.thumbnailUrl) || existing.thumbnailUrl,
        updatedAt: now
      };
      this.db.prepare(`
        UPDATE youtube_videos
        SET url = ?, title = ?, channel_title = ?, thumbnail_url = ?, updated_at = ?
        WHERE id = ?
      `).run(next.url, next.title, next.channelTitle, next.thumbnailUrl, next.updatedAt, next.id);
      return { video: this.getByYouTubeVideoId(youtubeVideoId) || next, alreadyAdded: true };
    }

    const video: YouTubeVideo = {
      id: randomUUID(),
      sourceType: 'youtube',
      youtubeVideoId,
      url: normalizeYouTubeWatchUrl(youtubeVideoId),
      sourcePath: '',
      originalFileName: '',
      title: normalizeText(input.title),
      description: '',
      channelTitle: normalizeText(input.channelTitle),
      channelId: '',
      channelUrl: '',
      uploader: '',
      uploaderId: '',
      uploaderUrl: '',
      thumbnailUrl: normalizeText(input.thumbnailUrl),
      durationSeconds: null,
      durationLabel: '',
      uploadDate: '',
      timestamp: null,
      viewCount: null,
      likeCount: null,
      commentCount: null,
      categories: [],
      tags: [],
      language: '',
      availability: '',
      liveStatus: '',
      ageLimit: null,
      webpageUrl: '',
      formats: [],
      metadataFetchedAt: null,
      status: 'added',
      transcriptionJobId: '',
      transcriptionEngine: '',
      rawText: '',
      cleanText: '',
      formattedText: '',
      summary: '',
      markdownPath: '',
      transcriptionError: '',
      transcriptionStartedAt: null,
      transcriptionFinishedAt: null,
      screenshots: [],
      trashedScreenshots: [],
      createdAt: now,
      updatedAt: now
    };

    this.db.prepare(`
      INSERT INTO youtube_videos (
        id,
        source_type,
        youtube_video_id,
        url,
        source_path,
        original_file_name,
        title,
        channel_title,
        thumbnail_url,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      video.id,
      video.sourceType,
      video.youtubeVideoId,
      video.url,
      video.sourcePath,
      video.originalFileName,
      video.title,
      video.channelTitle,
      video.thumbnailUrl,
      video.status,
      video.createdAt,
      video.updatedAt
    );

    return { video: this.getByYouTubeVideoId(youtubeVideoId) || video, alreadyAdded: false };
  }

  async addVideoWithMetadata(input: YouTubeVideoCreateRequest): Promise<AddYouTubeVideoResult> {
    const result = this.addVideo(input);
    return {
      ...result,
      video: await this.enrichMissingMetadata(result.video)
    };
  }

  addLocalFile(input: LocalVideoCreateRequest): AddYouTubeVideoResult {
    const now = this.now();
    const id = randomUUID();
    const originalFileName = normalizeText(input.originalFileName) || 'Local file';
    const sourcePath = normalizeText(input.sourcePath);
    const video: YouTubeVideo = {
      id,
      sourceType: 'file',
      youtubeVideoId: `file:${id}`,
      url: sourcePath ? pathToFileURL(sourcePath).href : `file:${id}`,
      sourcePath,
      originalFileName,
      title: normalizeText(input.title) || originalFileName,
      description: '',
      channelTitle: DEFAULT_TRANSCRIPTION_SOURCE_LABEL,
      channelId: '',
      channelUrl: '',
      uploader: '',
      uploaderId: '',
      uploaderUrl: '',
      thumbnailUrl: '',
      durationSeconds: null,
      durationLabel: '',
      uploadDate: '',
      timestamp: null,
      viewCount: null,
      likeCount: null,
      commentCount: null,
      categories: [],
      tags: [],
      language: '',
      availability: '',
      liveStatus: '',
      ageLimit: null,
      webpageUrl: '',
      formats: [],
      metadataFetchedAt: null,
      status: 'added',
      transcriptionJobId: '',
      transcriptionEngine: '',
      rawText: '',
      cleanText: '',
      formattedText: '',
      summary: '',
      markdownPath: '',
      transcriptionError: '',
      transcriptionStartedAt: null,
      transcriptionFinishedAt: null,
      screenshots: [],
      trashedScreenshots: [],
      createdAt: now,
      updatedAt: now
    };

    this.db.prepare(`
      INSERT INTO youtube_videos (
        id,
        source_type,
        youtube_video_id,
        url,
        source_path,
        original_file_name,
        title,
        channel_title,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      video.id,
      video.sourceType,
      video.youtubeVideoId,
      video.url,
      video.sourcePath,
      video.originalFileName,
      video.title,
      video.channelTitle,
      video.status,
      video.createdAt,
      video.updatedAt
    );

    return { video: this.requireVideo(id), alreadyAdded: false };
  }

  checkVideo(url: string): CheckYouTubeVideoResult {
    const youtubeVideoId = extractYouTubeVideoId(url);
    const video = youtubeVideoId ? this.getByYouTubeVideoId(youtubeVideoId) : null;
    return video ? { added: true, video } : { added: false, video: undefined };
  }

  getVideoById(id: string): YouTubeVideo | null {
    const row = this.db.prepare(`
      SELECT *
      FROM youtube_videos
      WHERE id = ?
    `).get(id) as YouTubeVideoRow | undefined;

    return row ? mapYouTubeVideoRow(row) : null;
  }

  async getVideoDetail(id: string, options: { refresh?: boolean } = {}): Promise<YouTubeVideoDetailResponse> {
    const video = this.getVideoById(id);
    if (!video) {
      throw createHttpError(404, 'Видео не найдено.');
    }

    if (video.sourceType !== 'youtube') {
      return { video };
    }

    if (!options.refresh && video.metadataFetchedAt) {
      return { video };
    }

    try {
      const metadata = await this.metadataFetcher(video.url);
      this.saveMetadata(video.id, metadata);
      return { video: this.getVideoById(video.id) || video };
    } catch (error) {
      return {
        video,
        metadataError: error instanceof Error ? error.message : 'Не удалось загрузить метаданные видео.'
      };
    }
  }

  listVideos(limit = 500): YouTubeVideo[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM youtube_videos
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as unknown as YouTubeVideoRow[];

    return rows.map(mapYouTubeVideoRow);
  }

  async listVideosWithMetadata(limit = 500): Promise<YouTubeVideo[]> {
    const videos = this.listVideos(limit);
    const missingMetadataVideos = videos
      .filter((video) => video.sourceType === 'youtube' && !video.metadataFetchedAt)
      .slice(0, DEFAULT_LIST_METADATA_ENRICHMENT_LIMIT);

    for (const video of missingMetadataVideos) {
      await this.enrichMissingMetadata(video);
    }

    return missingMetadataVideos.length > 0 ? this.listVideos(limit) : videos;
  }

  markTranscriptionProcessing(id: string, input: {
    jobId: string;
    engine?: string | undefined;
    startedAt?: number | undefined;
  }): YouTubeVideo {
    const video = this.requireVideo(id);
    const now = this.now();
    const startedAt = input.startedAt || now;

    this.db.prepare(`
      UPDATE youtube_videos
      SET
        status = 'processing',
        transcription_job_id = ?,
        transcription_engine = ?,
        transcription_error = '',
        transcription_started_at = ?,
        transcription_finished_at = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.jobId,
      input.engine || video.transcriptionEngine || '',
      startedAt,
      now,
      id
    );

    return this.requireVideo(id);
  }

  saveTranscriptionResult(id: string, input: {
    jobId: string;
    result: TranscriptionResult;
    finishedAt?: number | undefined;
  }): YouTubeVideo {
    const current = this.requireVideo(id);
    const finishedAt = input.finishedAt || this.now();
    const screenshots = Array.isArray(input.result.screenshots) ? input.result.screenshots : current.screenshots;

    this.db.prepare(`
      UPDATE youtube_videos
      SET
        status = 'done',
        transcription_job_id = ?,
        transcription_engine = ?,
        raw_text = ?,
        clean_text = ?,
        formatted_text = ?,
        summary = ?,
        markdown_path = ?,
        transcription_error = '',
        transcription_finished_at = ?,
        screenshots_json = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.jobId,
      input.result.engine || current.transcriptionEngine || '',
      input.result.rawText || '',
      input.result.cleanText || input.result.text || '',
      input.result.formattedText || '',
      input.result.summary || '',
      input.result.markdownPath || current.markdownPath || '',
      finishedAt,
      JSON.stringify(normalizeScreenshotsForStorage(screenshots)),
      finishedAt,
      id
    );

    return this.requireVideo(id);
  }

  saveTranscriptionError(id: string, input: {
    jobId: string;
    error: string;
    finishedAt?: number | undefined;
  }): YouTubeVideo {
    const finishedAt = input.finishedAt || this.now();

    this.db.prepare(`
      UPDATE youtube_videos
      SET
        status = 'error',
        transcription_job_id = ?,
        transcription_error = ?,
        transcription_finished_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.jobId,
      input.error,
      finishedAt,
      finishedAt,
      id
    );

    return this.requireVideo(id);
  }

  updateTranscript(id: string, patch: VideoTranscriptPatch): YouTubeVideo {
    this.requireVideo(id);
    const now = this.now();

    this.db.prepare(`
      UPDATE youtube_videos
      SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        channel_title = COALESCE(?, channel_title),
        summary = COALESCE(?, summary),
        clean_text = COALESCE(?, clean_text),
        formatted_text = COALESCE(?, formatted_text),
        raw_text = COALESCE(?, raw_text),
        markdown_path = COALESCE(?, markdown_path),
        transcription_engine = COALESCE(?, transcription_engine),
        transcription_finished_at = COALESCE(?, transcription_finished_at),
        updated_at = ?
      WHERE id = ?
    `).run(
      patch.title ?? null,
      patch.description ?? null,
      patch.channelTitle ?? null,
      patch.summary ?? null,
      patch.cleanText ?? null,
      patch.formattedText ?? null,
      patch.rawText ?? null,
      patch.markdownPath ?? null,
      patch.transcriptionEngine ?? null,
      patch.transcriptionFinishedAt ?? null,
      now,
      id
    );

    return this.requireVideo(id);
  }

  setScreenshots(id: string, screenshots: VideoScreenshot[], trashedScreenshots: VideoScreenshot[]): YouTubeVideo {
    this.requireVideo(id);
    const now = this.now();

    this.db.prepare(`
      UPDATE youtube_videos
      SET screenshots_json = ?, trashed_screenshots_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(normalizeScreenshotsForStorage(screenshots)),
      JSON.stringify(normalizeScreenshotsForStorage(trashedScreenshots)),
      now,
      id
    );

    return this.requireVideo(id);
  }

  private getByYouTubeVideoId(youtubeVideoId: string): YouTubeVideo | null {
    const row = this.db.prepare(`
      SELECT *
      FROM youtube_videos
      WHERE youtube_video_id = ?
    `).get(youtubeVideoId) as YouTubeVideoRow | undefined;

    return row ? mapYouTubeVideoRow(row) : null;
  }

  private requireVideo(id: string): YouTubeVideo {
    const video = this.getVideoById(id);
    if (!video) {
      throw createHttpError(404, 'Видео не найдено.');
    }
    return video;
  }

  private saveMetadata(id: string, metadata: YouTubeVideoMetadata): void {
    const metadataFetchedAt = this.now();
    const current = this.getVideoById(id);
    this.db.prepare(`
      UPDATE youtube_videos
      SET
        title = ?,
        description = ?,
        channel_title = ?,
        channel_id = ?,
        channel_url = ?,
        uploader = ?,
        uploader_id = ?,
        uploader_url = ?,
        thumbnail_url = ?,
        duration_seconds = ?,
        duration_label = ?,
        upload_date = ?,
        timestamp = ?,
        view_count = ?,
        like_count = ?,
        comment_count = ?,
        categories_json = ?,
        tags_json = ?,
        language = ?,
        availability = ?,
        live_status = ?,
        age_limit = ?,
        webpage_url = ?,
        formats_json = ?,
        raw_metadata_json = ?,
        metadata_fetched_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      metadata.title || current?.title || '',
      metadata.description,
      metadata.channelTitle || current?.channelTitle || '',
      metadata.channelId,
      metadata.channelUrl,
      metadata.uploader,
      metadata.uploaderId,
      metadata.uploaderUrl,
      metadata.thumbnailUrl || current?.thumbnailUrl || '',
      metadata.durationSeconds,
      metadata.durationLabel,
      metadata.uploadDate,
      metadata.timestamp,
      metadata.viewCount,
      metadata.likeCount,
      metadata.commentCount,
      JSON.stringify(metadata.categories),
      JSON.stringify(metadata.tags),
      metadata.language,
      metadata.availability,
      metadata.liveStatus,
      metadata.ageLimit,
      metadata.webpageUrl || current?.url || '',
      JSON.stringify(metadata.formats),
      metadata.rawMetadataJson,
      metadataFetchedAt,
      metadataFetchedAt,
      id
    );
  }

  private async enrichMissingMetadata(video: YouTubeVideo): Promise<YouTubeVideo> {
    if (video.metadataFetchedAt) return video;
    return this.fetchAndSaveMetadata(video);
  }

  private async fetchAndSaveMetadata(video: YouTubeVideo): Promise<YouTubeVideo> {
    try {
      const metadata = await this.metadataFetcher(video.url);
      this.saveMetadata(video.id, metadata);
      return this.getVideoById(video.id) || video;
    } catch {
      return video;
    }
  }

  private ensureSchema(): void {
    this.db.exec(`
      DROP TABLE IF EXISTS screenshots;
      DROP TABLE IF EXISTS transcriptions;

      CREATE TABLE IF NOT EXISTS youtube_videos (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL DEFAULT 'youtube' CHECK (source_type IN ('youtube', 'file')),
        youtube_video_id TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        source_path TEXT NOT NULL DEFAULT '',
        original_file_name TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        channel_title TEXT NOT NULL DEFAULT '',
        channel_id TEXT NOT NULL DEFAULT '',
        channel_url TEXT NOT NULL DEFAULT '',
        uploader TEXT NOT NULL DEFAULT '',
        uploader_id TEXT NOT NULL DEFAULT '',
        uploader_url TEXT NOT NULL DEFAULT '',
        thumbnail_url TEXT NOT NULL DEFAULT '',
        duration_seconds REAL,
        duration_label TEXT NOT NULL DEFAULT '',
        upload_date TEXT NOT NULL DEFAULT '',
        timestamp INTEGER,
        view_count INTEGER,
        like_count INTEGER,
        comment_count INTEGER,
        categories_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        language TEXT NOT NULL DEFAULT '',
        availability TEXT NOT NULL DEFAULT '',
        live_status TEXT NOT NULL DEFAULT '',
        age_limit INTEGER,
        webpage_url TEXT NOT NULL DEFAULT '',
        formats_json TEXT NOT NULL DEFAULT '[]',
        raw_metadata_json TEXT NOT NULL DEFAULT '',
        metadata_fetched_at INTEGER,
        status TEXT NOT NULL CHECK (status IN ('added', 'processing', 'done', 'error')),
        transcription_job_id TEXT NOT NULL DEFAULT '',
        transcription_engine TEXT NOT NULL DEFAULT '',
        raw_text TEXT NOT NULL DEFAULT '',
        clean_text TEXT NOT NULL DEFAULT '',
        formatted_text TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        markdown_path TEXT NOT NULL DEFAULT '',
        transcription_error TEXT NOT NULL DEFAULT '',
        transcription_started_at INTEGER,
        transcription_finished_at INTEGER,
        screenshots_json TEXT NOT NULL DEFAULT '[]',
        trashed_screenshots_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_youtube_videos_created_at
        ON youtube_videos(created_at DESC);
    `);
    this.ensureColumn('source_type', "TEXT NOT NULL DEFAULT 'youtube'");
    this.ensureColumn('source_path', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('original_file_name', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('description', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('channel_id', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('channel_url', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('uploader', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('uploader_id', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('uploader_url', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('duration_seconds', 'REAL');
    this.ensureColumn('duration_label', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('upload_date', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('timestamp', 'INTEGER');
    this.ensureColumn('view_count', 'INTEGER');
    this.ensureColumn('like_count', 'INTEGER');
    this.ensureColumn('comment_count', 'INTEGER');
    this.ensureColumn('categories_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('tags_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('language', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('availability', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('live_status', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('age_limit', 'INTEGER');
    this.ensureColumn('webpage_url', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('formats_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('raw_metadata_json', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('metadata_fetched_at', 'INTEGER');
    this.ensureColumn('transcription_job_id', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('transcription_engine', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('raw_text', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('clean_text', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('formatted_text', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('summary', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('markdown_path', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('transcription_error', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('transcription_started_at', 'INTEGER');
    this.ensureColumn('transcription_finished_at', 'INTEGER');
    this.ensureColumn('screenshots_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('trashed_screenshots_json', "TEXT NOT NULL DEFAULT '[]'");
    this.db.prepare(`
      UPDATE youtube_videos
      SET channel_title = ?
      WHERE source_type = 'file' AND channel_title = ''
    `).run(DEFAULT_TRANSCRIPTION_SOURCE_LABEL);
  }

  private ensureColumn(name: string, definition: string): void {
    const rows = this.db.prepare('PRAGMA table_info(youtube_videos)').all() as Array<{ name: string }>;
    if (rows.some((row) => row.name === name)) return;
    this.db.exec(`ALTER TABLE youtube_videos ADD COLUMN ${name} ${definition}`);
  }
}

export function createVideoLibraryStore(options: VideoLibraryStoreOptions = {}): VideoLibraryStore {
  return new VideoLibraryStore(options);
}

export const defaultVideoLibraryStore = createVideoLibraryStore();

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

function normalizeVideoId(value: string | null | undefined): string | null {
  const trimmed = String(value || '').trim();
  return /^[A-Za-z0-9_-]{6,32}$/.test(trimmed) ? trimmed : null;
}

function normalizeYouTubeWatchUrl(youtubeVideoId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeVideoId}`;
}

function normalizeText(value: string | undefined): string {
  return String(value || '').trim();
}

interface YouTubeVideoRow {
  id: string;
  source_type?: string | null;
  youtube_video_id: string;
  url: string;
  source_path?: string | null;
  original_file_name?: string | null;
  title: string;
  description: string;
  channel_title: string;
  channel_id: string;
  channel_url: string;
  uploader: string;
  uploader_id: string;
  uploader_url: string;
  thumbnail_url: string;
  duration_seconds: number | null;
  duration_label: string;
  upload_date: string;
  timestamp: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  categories_json: string;
  tags_json: string;
  language: string;
  availability: string;
  live_status: string;
  age_limit: number | null;
  webpage_url: string;
  formats_json: string;
  raw_metadata_json: string;
  metadata_fetched_at: number | null;
  status: string;
  transcription_job_id: string;
  transcription_engine: string;
  raw_text: string;
  clean_text: string;
  formatted_text: string;
  summary: string;
  markdown_path: string;
  transcription_error: string;
  transcription_started_at: number | null;
  transcription_finished_at: number | null;
  screenshots_json: string;
  trashed_screenshots_json: string;
  created_at: number;
  updated_at: number;
}

function mapYouTubeVideoRow(row: YouTubeVideoRow): YouTubeVideo {
  const id = row.id;
  const sourceType = normalizeSourceType(row.source_type);
  return {
    id,
    sourceType,
    youtubeVideoId: row.youtube_video_id,
    url: row.url,
    sourcePath: row.source_path || '',
    originalFileName: row.original_file_name || '',
    title: row.title || '',
    description: row.description || '',
    channelTitle: row.channel_title || '',
    channelId: row.channel_id || '',
    channelUrl: row.channel_url || '',
    uploader: row.uploader || '',
    uploaderId: row.uploader_id || '',
    uploaderUrl: row.uploader_url || '',
    thumbnailUrl: row.thumbnail_url || '',
    durationSeconds: nullableNumber(row.duration_seconds),
    durationLabel: row.duration_label || '',
    uploadDate: row.upload_date || '',
    timestamp: nullableNumber(row.timestamp),
    viewCount: nullableNumber(row.view_count),
    likeCount: nullableNumber(row.like_count),
    commentCount: nullableNumber(row.comment_count),
    categories: parseStringArray(row.categories_json),
    tags: parseStringArray(row.tags_json),
    language: row.language || '',
    availability: row.availability || '',
    liveStatus: row.live_status || '',
    ageLimit: nullableNumber(row.age_limit),
    webpageUrl: row.webpage_url || '',
    formats: parseFormats(row.formats_json),
    metadataFetchedAt: nullableNumber(row.metadata_fetched_at),
    status: row.status === 'processing' || row.status === 'done' || row.status === 'error' ? row.status : 'added',
    transcriptionJobId: row.transcription_job_id || '',
    transcriptionEngine: row.transcription_engine || '',
    rawText: row.raw_text || '',
    cleanText: row.clean_text || '',
    formattedText: row.formatted_text || '',
    summary: row.summary || '',
    markdownPath: row.markdown_path || '',
    transcriptionError: row.transcription_error || '',
    transcriptionStartedAt: nullableNumber(row.transcription_started_at),
    transcriptionFinishedAt: nullableNumber(row.transcription_finished_at),
    screenshots: parseScreenshots(row.screenshots_json, id, 'active'),
    trashedScreenshots: parseScreenshots(row.trashed_screenshots_json, id, 'trash'),
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || Number(row.created_at) || 0
  };
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeSourceType(value: unknown): VideoSourceType {
  return value === 'file' ? 'file' : 'youtube';
}

function parseStringArray(value: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseFormats(value: string | null | undefined): VideoFormat[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(isVideoFormat) : [];
  } catch {
    return [];
  }
}

function parseScreenshots(
  value: string | null | undefined,
  videoId: string,
  scope: 'active' | 'trash'
): VideoScreenshot[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeScreenshot(item, videoId, scope))
      .filter((item): item is VideoScreenshot => item !== null);
  } catch {
    return [];
  }
}

function normalizeScreenshot(
  value: unknown,
  videoId: string,
  scope: 'active' | 'trash'
): VideoScreenshot | null {
  if (!value || typeof value !== 'object') return null;
  const screenshot = value as Partial<VideoScreenshot>;
  if (typeof screenshot.fileName !== 'string' || !/^[^/\\]+\.jpg$/i.test(screenshot.fileName)) return null;

  return {
    fileName: screenshot.fileName,
    timestampSeconds: nullableNumber(screenshot.timestampSeconds) || 0,
    exists: typeof screenshot.exists === 'boolean' ? screenshot.exists : true,
    url: `/videos/library/${encodeURIComponent(videoId)}/screenshots/${scope}/${encodeURIComponent(screenshot.fileName)}`
  };
}

function normalizeScreenshotsForStorage(screenshots: VideoScreenshot[]): Array<{ fileName: string; timestampSeconds: number }> {
  return screenshots
    .filter((screenshot) => /^[^/\\]+\.jpg$/i.test(screenshot.fileName))
    .map((screenshot) => ({
      fileName: screenshot.fileName,
      timestampSeconds: Number.isFinite(screenshot.timestampSeconds) ? screenshot.timestampSeconds : 0
    }));
}

function isVideoFormat(value: unknown): value is VideoFormat {
  if (!value || typeof value !== 'object') return false;
  const format = value as Partial<VideoFormat>;
  return typeof format.id === 'string' && typeof format.label === 'string';
}

async function fetchYouTubeVideoMetadata(url: string): Promise<YouTubeVideoMetadata> {
  const result = await runCommand(getYtDlpCommand(), ['--dump-json', '--no-playlist', url]);
  const rawMetadataJson = result.stdout;
  let parsed: YtDlpMetadata;

  try {
    parsed = JSON.parse(rawMetadataJson) as YtDlpMetadata;
  } catch {
    throw createHttpError(500, 'Не удалось разобрать метаданные видео из yt-dlp.');
  }

  return normalizeYtDlpMetadata(parsed, rawMetadataJson);
}

function normalizeYtDlpMetadata(info: YtDlpMetadata, rawMetadataJson: string): YouTubeVideoMetadata {
  const formats = normalizeFormats(Array.isArray(info.formats) ? info.formats : []);
  return {
    title: stringValue(info.title || info.fulltitle),
    description: stringValue(info.description),
    channelTitle: stringValue(info.channel || info.uploader),
    channelId: stringValue(info.channel_id),
    channelUrl: stringValue(info.channel_url),
    uploader: stringValue(info.uploader),
    uploaderId: stringValue(info.uploader_id),
    uploaderUrl: stringValue(info.uploader_url),
    durationSeconds: nullableNumber(info.duration),
    durationLabel: stringValue(info.duration_string),
    uploadDate: stringValue(info.upload_date),
    timestamp: nullableNumber(info.timestamp || info.release_timestamp),
    viewCount: nullableNumber(info.view_count),
    likeCount: nullableNumber(info.like_count),
    commentCount: nullableNumber(info.comment_count),
    categories: Array.isArray(info.categories) ? info.categories.filter((item): item is string => typeof item === 'string') : [],
    tags: Array.isArray(info.tags) ? info.tags.filter((item): item is string => typeof item === 'string') : [],
    language: stringValue(info.language),
    availability: stringValue(info.availability),
    liveStatus: stringValue(info.live_status),
    ageLimit: nullableNumber(info.age_limit),
    thumbnailUrl: stringValue(info.thumbnail),
    webpageUrl: stringValue(info.webpage_url),
    formats,
    rawMetadataJson
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildChildEnv()
    });
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
    child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
    child.once('error', (error) => reject(createHttpError(500, error.message)));
    child.once('close', (code) => {
      if (code !== 0) {
        reject(createHttpError(500, `${command} failed with exit code ${code}.${stderr.length ? ` stderr: ${stderr.join('').trim()}` : ''}`));
        return;
      }
      resolve({ code, stdout: stdout.join(''), stderr: stderr.join('') });
    });
  });
}

function getYtDlpCommand(): string {
  return process.env.YTDLP_COMMAND || 'yt-dlp';
}

function buildChildEnv(): NodeJS.ProcessEnv {
  const commandDir = path.dirname(getYtDlpCommand());
  const pathParts = [commandDir, process.env.PATH || ''].filter(Boolean);
  return {
    ...process.env,
    PATH: [...new Set(pathParts)].join(path.delimiter)
  };
}

interface YtDlpMetadata {
  title?: unknown;
  fulltitle?: unknown;
  description?: unknown;
  channel?: unknown;
  channel_id?: unknown;
  channel_url?: unknown;
  uploader?: unknown;
  uploader_id?: unknown;
  uploader_url?: unknown;
  duration?: unknown;
  duration_string?: unknown;
  upload_date?: unknown;
  timestamp?: unknown;
  release_timestamp?: unknown;
  view_count?: unknown;
  like_count?: unknown;
  comment_count?: unknown;
  categories?: unknown;
  tags?: unknown;
  language?: unknown;
  availability?: unknown;
  live_status?: unknown;
  age_limit?: unknown;
  thumbnail?: unknown;
  webpage_url?: unknown;
  formats?: YtDlpVideoFormatObject[];
}
