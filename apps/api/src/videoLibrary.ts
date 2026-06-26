import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHttpError } from './errors.js';
import { DEFAULT_DB_PATH } from './transcriptionStore.js';
import type { YouTubeVideo, YouTubeVideoCreateRequest } from '@transcribator/shared';

export interface VideoLibraryStoreOptions {
  dbPath?: string | undefined;
  now?: (() => number) | undefined;
}

export interface AddYouTubeVideoResult {
  video: YouTubeVideo;
  alreadyAdded: boolean;
}

export interface CheckYouTubeVideoResult {
  added: boolean;
  video?: YouTubeVideo | undefined;
}

export class VideoLibraryStore {
  readonly dbPath: string;
  private readonly db: DatabaseSync;
  private readonly now: () => number;

  constructor(options: VideoLibraryStoreOptions = {}) {
    this.dbPath = options.dbPath || DEFAULT_DB_PATH;
    this.now = options.now || Date.now;
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
      youtubeVideoId,
      url: normalizeYouTubeWatchUrl(youtubeVideoId),
      title: normalizeText(input.title),
      channelTitle: normalizeText(input.channelTitle),
      thumbnailUrl: normalizeText(input.thumbnailUrl),
      status: 'added',
      createdAt: now,
      updatedAt: now
    };

    this.db.prepare(`
      INSERT INTO youtube_videos (
        id,
        youtube_video_id,
        url,
        title,
        channel_title,
        thumbnail_url,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      video.id,
      video.youtubeVideoId,
      video.url,
      video.title,
      video.channelTitle,
      video.thumbnailUrl,
      video.status,
      video.createdAt,
      video.updatedAt
    );

    return { video, alreadyAdded: false };
  }

  checkVideo(url: string): CheckYouTubeVideoResult {
    const youtubeVideoId = extractYouTubeVideoId(url);
    const video = youtubeVideoId ? this.getByYouTubeVideoId(youtubeVideoId) : null;
    return video ? { added: true, video } : { added: false, video: undefined };
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

  private getByYouTubeVideoId(youtubeVideoId: string): YouTubeVideo | null {
    const row = this.db.prepare(`
      SELECT *
      FROM youtube_videos
      WHERE youtube_video_id = ?
    `).get(youtubeVideoId) as YouTubeVideoRow | undefined;

    return row ? mapYouTubeVideoRow(row) : null;
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS youtube_videos (
        id TEXT PRIMARY KEY,
        youtube_video_id TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        channel_title TEXT NOT NULL DEFAULT '',
        thumbnail_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('added', 'processing', 'done', 'error')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_youtube_videos_created_at
        ON youtube_videos(created_at DESC);
    `);
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
  youtube_video_id: string;
  url: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  status: string;
  created_at: number;
  updated_at: number;
}

function mapYouTubeVideoRow(row: YouTubeVideoRow): YouTubeVideo {
  return {
    id: row.id,
    youtubeVideoId: row.youtube_video_id,
    url: row.url,
    title: row.title || '',
    channelTitle: row.channel_title || '',
    thumbnailUrl: row.thumbnail_url || '',
    status: row.status === 'processing' || row.status === 'done' || row.status === 'error' ? row.status : 'added',
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || Number(row.created_at) || 0
  };
}
