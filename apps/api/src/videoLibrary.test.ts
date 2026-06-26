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
});

async function tempDbPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'transcribator-video-library-'));
  return path.join(dir, 'test.sqlite');
}
