import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApiClient, type FetchLike } from './index.js';

describe('api client defaults', () => {
  it('uses the Transcribator API port in the 2000 range by default', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };

    await createApiClient({ fetchImpl }).health();

    assert.deepEqual(requestedUrls, ['http://127.0.0.1:2001/health']);
  });

  it('adds YouTube videos to the CRM video library', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init = {}) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        alreadyAdded: false,
        video: {
          id: 'video-id',
          youtubeVideoId: 'dQw4w9WgXcQ',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Видео',
          channelTitle: 'Канал',
          thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          status: 'added',
          createdAt: 1,
          updatedAt: 1
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const result = await createApiClient({ fetchImpl }).addYouTubeVideo({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Видео',
      channelTitle: 'Канал',
      thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    });

    assert.equal(result.video.youtubeVideoId, 'dQw4w9WgXcQ');
    assert.equal(requests[0]?.url, 'http://127.0.0.1:2001/videos/library');
    assert.equal(requests[0]?.init.method, 'POST');
    assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Видео',
      channelTitle: 'Канал',
      thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    });
  });

  it('checks YouTube video library status by URL', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({ added: false }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const result = await createApiClient({ fetchImpl }).checkYouTubeVideo('https://youtu.be/dQw4w9WgXcQ');

    assert.deepEqual(result, { added: false });
    assert.deepEqual(requestedUrls, [
      'http://127.0.0.1:2001/videos/library/check?url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ'
    ]);
  });
});
