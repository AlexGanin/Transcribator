import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createVideoLibraryStore, type YouTubeVideoMetadata } from './videoLibrary.js';

describe('YouTube video library store', () => {
  it('adds YouTube videos and deduplicates them by video id', async () => {
    const store = createVideoLibraryStore({ dbPath: await tempDbPath() });

    try {
      const first = store.addVideo({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Первое название',
        channelTitle: 'Канал',
        thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
      });
      const second = store.addVideo({
        url: 'https://youtu.be/dQw4w9WgXcQ?si=abc',
        title: 'Обновленное название',
        channelTitle: 'Канал',
        thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
      });

      assert.equal(first.alreadyAdded, false);
      assert.equal(second.alreadyAdded, true);
      assert.equal(second.video.id, first.video.id);
      assert.equal(second.video.youtubeVideoId, 'dQw4w9WgXcQ');
      assert.equal(second.video.title, 'Обновленное название');
      assert.deepEqual(store.listVideos().map((video) => video.youtubeVideoId), ['dQw4w9WgXcQ']);
    } finally {
      store.close();
    }
  });

  it('checks whether a YouTube video is already in the library', async () => {
    const store = createVideoLibraryStore({ dbPath: await tempDbPath() });

    try {
      assert.deepEqual(store.checkVideo('https://www.youtube.com/watch?v=abc12345678'), {
        added: false,
        video: undefined
      });

      const added = store.addVideo({ url: 'https://www.youtube.com/watch?v=abc12345678', title: 'Видео' });

      assert.deepEqual(store.checkVideo('https://youtu.be/abc12345678'), {
        added: true,
        video: added.video
      });
    } finally {
      store.close();
    }
  });

  it('rejects non-YouTube URLs with a client error', async () => {
    const store = createVideoLibraryStore({ dbPath: await tempDbPath() });

    try {
      assert.throws(
        () => store.addVideo({ url: 'https://example.com/watch?v=abc12345678' }),
        (error: unknown) =>
          error instanceof Error
          && error.name === 'HttpError'
          && 'statusCode' in error
          && error.statusCode === 400
      );
    } finally {
      store.close();
    }
  });

  it('adds local files to the video library', async () => {
    const store = createVideoLibraryStore({ dbPath: await tempDbPath(), now: () => 123456 });

    try {
      const added = store.addLocalFile({
        originalFileName: 'meeting-recording.mp4',
        sourcePath: '/tmp/transcribator/meeting-recording.mp4'
      });

      assert.equal(added.alreadyAdded, false);
      assert.equal(added.video.sourceType, 'file');
      assert.equal(added.video.title, 'meeting-recording.mp4');
      assert.equal(added.video.channelTitle, 'Транскрибации');
      assert.equal(added.video.originalFileName, 'meeting-recording.mp4');
      assert.equal(added.video.sourcePath, '/tmp/transcribator/meeting-recording.mp4');
      assert.equal(added.video.youtubeVideoId, `file:${added.video.id}`);
      assert.match(added.video.url, /^file:\/\//);
      assert.equal(added.video.status, 'added');
      assert.equal(store.listVideos()[0]?.id, added.video.id);
    } finally {
      store.close();
    }
  });

  it('updates thumbnail URLs for any saved video', async () => {
    let timestamp = 1000;
    const store = createVideoLibraryStore({
      dbPath: await tempDbPath(),
      now: () => {
        timestamp += 100;
        return timestamp;
      }
    });

    try {
      const added = store.addLocalFile({
        originalFileName: 'meeting-recording.mp4',
        sourcePath: '/tmp/transcribator/meeting-recording.mp4'
      });
      const thumbnailUrl = `/videos/library/${encodeURIComponent(added.video.id)}/thumbnail/thumbnail-123.png`;
      const updated = store.setThumbnailUrl(added.video.id, thumbnailUrl);

      assert.equal(updated.thumbnailUrl, thumbnailUrl);
      assert.equal(updated.updatedAt, 1200);
      assert.equal(store.getVideoById(added.video.id)?.thumbnailUrl, thumbnailUrl);
    } finally {
      store.close();
    }
  });

  it('loads, stores and returns detailed YouTube metadata by video id', async () => {
    const store = createVideoLibraryStore({
      dbPath: await tempDbPath(),
      now: () => 123456,
      metadataFetcher: async (url) => {
        assert.equal(url, 'https://www.youtube.com/watch?v=detail12345');
        return {
          title: 'Подробное видео',
          description: 'Описание ролика',
          channelTitle: 'Канал',
          channelId: 'channel-id',
          channelUrl: 'https://www.youtube.com/channel/channel-id',
          uploader: 'Автор',
          uploaderId: 'uploader-id',
          uploaderUrl: 'https://www.youtube.com/@author',
          durationSeconds: 3723,
          durationLabel: '1:02:03',
          uploadDate: '20260610',
          timestamp: 1781059200,
          viewCount: 12345,
          likeCount: 234,
          commentCount: 12,
          categories: ['Education'],
          tags: ['crm', 'youtube'],
          language: 'ru',
          availability: 'public',
          liveStatus: 'not_live',
          ageLimit: 0,
          thumbnailUrl: 'https://img.youtube.com/vi/detail12345/maxresdefault.jpg',
          webpageUrl: 'https://www.youtube.com/watch?v=detail12345',
          formats: [
            {
              id: '137',
              label: '1080p · mp4 · 30fps · ~150 MB · audio will be merged',
              ext: 'mp4',
              resolution: '1920x1080',
              height: 1080,
              width: 1920,
              fps: 30,
              sizeLabel: '~150 MB',
              hasAudio: false,
              hasVideo: true
            }
          ],
          rawMetadataJson: '{"title":"Подробное видео"}'
        };
      }
    });

    try {
      const added = store.addVideo({ url: 'https://www.youtube.com/watch?v=detail12345' });
      const detail = await store.getVideoDetail(added.video.id);

      assert.equal(detail.video.id, added.video.id);
      assert.equal(detail.video.title, 'Подробное видео');
      assert.equal(detail.video.channelTitle, 'Канал');
      assert.equal(detail.video.durationSeconds, 3723);
      assert.equal(detail.video.metadataFetchedAt, 123456);
      assert.deepEqual(detail.video.tags, ['crm', 'youtube']);
      assert.equal(detail.video.formats[0]?.height, 1080);
      assert.equal(store.getVideoById(added.video.id)?.durationLabel, '1:02:03');
    } finally {
      store.close();
    }
  });

  it('keeps manually assigned thumbnails when refreshing YouTube metadata', async () => {
    const store = createVideoLibraryStore({
      dbPath: await tempDbPath(),
      now: () => 123456,
      metadataFetcher: async () => createMetadata({
        title: 'Обновленное видео',
        thumbnailUrl: 'https://img.youtube.com/vi/manual12345/maxresdefault.jpg'
      })
    });

    try {
      const added = store.addVideo({
        url: 'https://www.youtube.com/watch?v=manual12345',
        thumbnailUrl: 'https://img.youtube.com/vi/manual12345/hqdefault.jpg'
      });
      const thumbnailUrl = `/videos/library/${encodeURIComponent(added.video.id)}/thumbnail/thumbnail-123.jpg`;

      store.setThumbnailUrl(added.video.id, thumbnailUrl);

      const detail = await store.getVideoDetail(added.video.id, { refresh: true });

      assert.equal(detail.video.title, 'Обновленное видео');
      assert.equal(detail.video.thumbnailUrl, thumbnailUrl);
    } finally {
      store.close();
    }
  });

  it('fills missing channel metadata when adding a video without channel title', async () => {
    const store = createVideoLibraryStore({
      dbPath: await tempDbPath(),
      now: () => 123456,
      metadataFetcher: async (url) => {
        assert.equal(url, 'https://www.youtube.com/watch?v=missing1234');
        return createMetadata({
          title: 'Видео с метаданными',
          channelTitle: 'Канал из yt-dlp',
          uploader: 'Автор из yt-dlp'
        });
      }
    });

    try {
      const result = await store.addVideoWithMetadata({
        url: 'https://www.youtube.com/watch?v=missing1234',
        title: 'Название из расширения'
      });

      assert.equal(result.video.channelTitle, 'Канал из yt-dlp');
      assert.equal(result.video.uploader, 'Автор из yt-dlp');
      assert.equal(result.video.metadataFetchedAt, 123456);
      assert.equal(store.getVideoById(result.video.id)?.channelTitle, 'Канал из yt-dlp');
    } finally {
      store.close();
    }
  });

  it('loads full metadata when adding a video even if extension already sent channel title', async () => {
    const store = createVideoLibraryStore({
      dbPath: await tempDbPath(),
      now: () => 123456,
      metadataFetcher: async (url) => {
        assert.equal(url, 'https://www.youtube.com/watch?v=fullmeta123');
        return createMetadata({
          title: 'Полная карточка',
          description: 'Описание из yt-dlp',
          channelTitle: 'Канал из yt-dlp',
          uploader: 'Автор из yt-dlp',
          durationSeconds: 321,
          tags: ['tag-a', 'tag-b']
        });
      }
    });

    try {
      const result = await store.addVideoWithMetadata({
        url: 'https://www.youtube.com/watch?v=fullmeta123',
        title: 'Название из расширения',
        channelTitle: 'Канал из расширения',
        thumbnailUrl: 'https://img.youtube.com/vi/fullmeta123/hqdefault.jpg'
      });

      assert.equal(result.video.title, 'Полная карточка');
      assert.equal(result.video.description, 'Описание из yt-dlp');
      assert.equal(result.video.channelTitle, 'Канал из yt-dlp');
      assert.equal(result.video.durationSeconds, 321);
      assert.deepEqual(result.video.tags, ['tag-a', 'tag-b']);
      assert.equal(result.video.metadataFetchedAt, 123456);
    } finally {
      store.close();
    }
  });

  it('enriches existing list rows that were saved without channel metadata', async () => {
    const store = createVideoLibraryStore({
      dbPath: await tempDbPath(),
      now: () => 123456,
      metadataFetcher: async (url) => {
        assert.equal(url, 'https://www.youtube.com/watch?v=list1234567');
        return createMetadata({
          title: 'Видео из списка',
          channelTitle: 'Канал списка',
          uploader: 'Автор списка'
        });
      }
    });

    try {
      const added = store.addVideo({
        url: 'https://www.youtube.com/watch?v=list1234567',
        title: 'Видео без канала'
      });

      assert.equal(added.video.channelTitle, '');

      const videos = await store.listVideosWithMetadata();

      assert.equal(videos[0]?.channelTitle, 'Канал списка');
      assert.equal(videos[0]?.uploader, 'Автор списка');
      assert.equal(videos[0]?.metadataFetchedAt, 123456);
    } finally {
      store.close();
    }
  });

  it('enriches existing list rows without full metadata even when channel title is already known', async () => {
    const store = createVideoLibraryStore({
      dbPath: await tempDbPath(),
      now: () => 123456,
      metadataFetcher: async (url) => {
        assert.equal(url, 'https://www.youtube.com/watch?v=knownchan1');
        return createMetadata({
          title: 'Видео с полной metadata',
          description: 'Описание для списка',
          channelTitle: 'Канал из списка',
          durationSeconds: 654,
          tags: ['existing']
        });
      }
    });

    try {
      const added = store.addVideo({
        url: 'https://www.youtube.com/watch?v=knownchan1',
        title: 'Видео с каналом, но без metadata',
        channelTitle: 'Канал из расширения'
      });

      assert.equal(added.video.channelTitle, 'Канал из расширения');
      assert.equal(added.video.metadataFetchedAt, null);

      const videos = await store.listVideosWithMetadata();

      assert.equal(videos[0]?.title, 'Видео с полной metadata');
      assert.equal(videos[0]?.description, 'Описание для списка');
      assert.equal(videos[0]?.channelTitle, 'Канал из списка');
      assert.equal(videos[0]?.durationSeconds, 654);
      assert.deepEqual(videos[0]?.tags, ['existing']);
      assert.equal(videos[0]?.metadataFetchedAt, 123456);
    } finally {
      store.close();
    }
  });

  it('drops legacy history tables when opening the video library store', async () => {
    const dbPath = await tempDbPath();
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE transcriptions (id TEXT PRIMARY KEY);
      CREATE TABLE screenshots (id TEXT PRIMARY KEY);
    `);
    db.close();

    const store = createVideoLibraryStore({ dbPath });

    try {
      const dbAfter = new DatabaseSync(dbPath);
      try {
        const tables = dbAfter.prepare(`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name
        `).all() as Array<{ name: string }>;

        assert.deepEqual(tables.map((table) => table.name), ['youtube_videos']);
      } finally {
        dbAfter.close();
      }
    } finally {
      store.close();
    }
  });

  it('stores transcription fields and screenshots on the YouTube video row', async () => {
    const store = createVideoLibraryStore({ dbPath: await tempDbPath(), now: () => 1000 });

    try {
      const added = store.addVideo({
        url: 'https://www.youtube.com/watch?v=transcr123',
        title: 'Видео для транскрибации'
      });

      const processing = store.markTranscriptionProcessing(added.video.id, {
        jobId: 'job-1',
        engine: 'mlx-whisper',
        startedAt: 900
      });

      assert.equal(processing.status, 'processing');
      assert.equal(processing.transcriptionJobId, 'job-1');
      assert.equal(processing.transcriptionEngine, 'mlx-whisper');
      assert.equal(processing.transcriptionStartedAt, 900);

      const done = store.saveTranscriptionResult(added.video.id, {
        jobId: 'job-1',
        finishedAt: 1200,
        result: {
          rawText: 'Raw transcript',
          cleanText: 'Clean transcript',
          formattedText: '',
          summary: '',
          source: 'https://www.youtube.com/watch?v=transcr123',
          engine: 'mlx-whisper',
          screenshots: [
            {
              fileName: 'frame-0001.jpg',
              timestampSeconds: 30,
              exists: true,
              url: ''
            }
          ],
          screenshotsCount: 1
        }
      });

      assert.equal(done.status, 'done');
      assert.equal(done.rawText, 'Raw transcript');
      assert.equal(done.cleanText, 'Clean transcript');
      assert.equal(done.transcriptionFinishedAt, 1200);
      assert.equal(done.screenshots[0]?.url, `/videos/library/${encodeURIComponent(added.video.id)}/screenshots/active/frame-0001.jpg`);
    } finally {
      store.close();
    }
  });

  it('updates editable video card fields with transcript fields', async () => {
    const store = createVideoLibraryStore({ dbPath: await tempDbPath(), now: () => 2000 });

    try {
      const added = store.addLocalFile({
        originalFileName: 'raw-recording.mov',
        sourcePath: '/tmp/transcribator/raw-recording.mov'
      });

      const updated = store.updateTranscript(added.video.id, {
        title: 'Интервью с клиентом',
        manualDate: '2026-07-11',
        description: 'Контекст для последующей ручной разметки.',
        channelTitle: 'Локальные интервью',
        cleanText: 'Clean transcript'
      });

      assert.equal(updated.title, 'Интервью с клиентом');
      assert.equal(updated.manualDate, '2026-07-11');
      assert.equal(updated.description, 'Контекст для последующей ручной разметки.');
      assert.equal(updated.channelTitle, 'Локальные интервью');
      assert.equal(updated.cleanText, 'Clean transcript');
      assert.equal(updated.updatedAt, 2000);
    } finally {
      store.close();
    }
  });
});

async function tempDbPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'transcribator-video-library-'));
  return path.join(dir, 'test.sqlite');
}

function createMetadata(overrides: Partial<YouTubeVideoMetadata> = {}): YouTubeVideoMetadata {
  return {
    title: 'Подробное видео',
    description: 'Описание ролика',
    channelTitle: 'Канал',
    channelId: 'channel-id',
    channelUrl: 'https://www.youtube.com/channel/channel-id',
    uploader: 'Автор',
    uploaderId: 'uploader-id',
    uploaderUrl: 'https://www.youtube.com/@author',
    durationSeconds: 3723,
    durationLabel: '1:02:03',
    uploadDate: '20260610',
    timestamp: 1781059200,
    viewCount: 12345,
    likeCount: 234,
    commentCount: 12,
    categories: ['Education'],
    tags: ['crm', 'youtube'],
    language: 'ru',
    availability: 'public',
    liveStatus: 'not_live',
    ageLimit: 0,
    thumbnailUrl: 'https://img.youtube.com/vi/detail12345/maxresdefault.jpg',
    webpageUrl: 'https://www.youtube.com/watch?v=detail12345',
    formats: [
      {
        id: '137',
        label: '1080p · mp4 · 30fps · ~150 MB · audio will be merged',
        ext: 'mp4',
        resolution: '1920x1080',
        height: 1080,
        width: 1920,
        fps: 30,
        sizeLabel: '~150 MB',
        hasAudio: false,
        hasVideo: true
      }
    ],
    rawMetadataJson: '{"title":"Подробное видео"}',
    ...overrides
  };
}
