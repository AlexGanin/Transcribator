import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createVideoLibraryStore } from './videoLibrary.js';

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
});

async function tempDbPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'transcribator-video-library-'));
  return path.join(dir, 'test.sqlite');
}
