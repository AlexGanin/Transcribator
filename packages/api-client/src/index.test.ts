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

  it('loads YouTube video details by CRM library id', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({
        video: {
          id: 'video-id',
          youtubeVideoId: 'dQw4w9WgXcQ',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Видео',
          description: 'Описание',
          channelTitle: 'Канал',
          channelId: 'channel-id',
          channelUrl: 'https://www.youtube.com/channel/channel-id',
          uploader: 'Автор',
          uploaderId: 'uploader-id',
          uploaderUrl: 'https://www.youtube.com/@author',
          thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          durationSeconds: 120,
          durationLabel: '2:00',
          uploadDate: '20260610',
          timestamp: 1781059200,
          viewCount: 1000,
          likeCount: 50,
          commentCount: 4,
          categories: ['Education'],
          tags: ['crm'],
          language: 'ru',
          availability: 'public',
          liveStatus: 'not_live',
          ageLimit: 0,
          webpageUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          formats: [],
          metadataFetchedAt: 123456,
          status: 'added',
          createdAt: 1,
          updatedAt: 2
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const result = await createApiClient({ fetchImpl }).getYouTubeVideo('video-id');

    assert.equal(result.video.durationSeconds, 120);
    assert.deepEqual(requestedUrls, ['http://127.0.0.1:2001/videos/library/video-id']);
  });

  it('refreshes YouTube video metadata by CRM library id', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init = {}) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        video: {
          id: 'video-id',
          youtubeVideoId: 'dQw4w9WgXcQ',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Видео',
          status: 'added',
          createdAt: 1,
          updatedAt: 2
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };

    await createApiClient({ fetchImpl }).refreshYouTubeVideoMetadata('video-id');

    assert.equal(requests[0]?.url, 'http://127.0.0.1:2001/videos/library/video-id/metadata');
    assert.equal(requests[0]?.init.method, 'POST');
  });

  it('starts YouTube video transcription by CRM library id', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init = {}) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        jobId: 'job-1',
        video: {
          id: 'video-id',
          youtubeVideoId: 'dQw4w9WgXcQ',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Видео',
          status: 'processing',
          transcriptionJobId: 'job-1',
          createdAt: 1,
          updatedAt: 2
        }
      }), { headers: { 'Content-Type': 'application/json' } });
    };

    const result = await createApiClient({ fetchImpl }).transcribeYouTubeVideo('video-id', {
      engine: 'mlx-whisper',
      screenshotsEnabled: true,
      screenshotIntervalSeconds: 30
    });

    assert.equal(result.jobId, 'job-1');
    assert.equal(requests[0]?.url, 'http://127.0.0.1:2001/videos/library/video-id/transcribe');
    assert.equal(requests[0]?.init.method, 'POST');
    assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
      engine: 'mlx-whisper',
      screenshotsEnabled: true,
      screenshotIntervalSeconds: 30
    });
  });

  it('updates YouTube video transcript fields', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init = {}) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        video: {
          id: 'video-id',
          youtubeVideoId: 'dQw4w9WgXcQ',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Видео',
          manualDate: '2026-07-11',
          status: 'done',
          cleanText: 'clean',
          createdAt: 1,
          updatedAt: 2
        }
      }), { headers: { 'Content-Type': 'application/json' } });
    };

    const result = await createApiClient({ fetchImpl }).updateYouTubeVideoTranscript('video-id', {
      manualDate: '2026-07-11',
      cleanText: 'clean'
    });

    assert.equal(result.video.manualDate, '2026-07-11');
    assert.equal(result.video.cleanText, 'clean');
    assert.equal(requests[0]?.url, 'http://127.0.0.1:2001/videos/library/video-id/transcript');
    assert.equal(requests[0]?.init.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
      manualDate: '2026-07-11',
      cleanText: 'clean'
    });
  });

  it('uploads a video thumbnail as multipart form data', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init = {}) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        video: {
          id: 'video-id',
          youtubeVideoId: 'dQw4w9WgXcQ',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Видео',
          status: 'done',
          thumbnailUrl: '/videos/library/video-id/thumbnail/thumbnail-123.png',
          createdAt: 1,
          updatedAt: 2
        }
      }), { headers: { 'Content-Type': 'application/json' } });
    };
    const file = new File(['image-bytes'], 'cover.png', { type: 'image/png' });

    const result = await createApiClient({ fetchImpl }).uploadYouTubeVideoThumbnail('video-id', file);

    assert.equal(result.video.thumbnailUrl, '/videos/library/video-id/thumbnail/thumbnail-123.png');
    assert.equal(requests[0]?.url, 'http://127.0.0.1:2001/videos/library/video-id/thumbnail');
    assert.equal(requests[0]?.init.method, 'POST');
    assert.ok(requests[0]?.init.body instanceof FormData);
    assert.equal((requests[0]?.init.body as FormData).get('file'), file);
  });

  it('deletes a video from the CRM library', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init = {}) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ deletedId: 'video-id' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const result = await createApiClient({ fetchImpl }).deleteYouTubeVideo('video-id');

    assert.deepEqual(result, { deletedId: 'video-id' });
    assert.equal(requests[0]?.url, 'http://127.0.0.1:2001/videos/library/video-id');
    assert.equal(requests[0]?.init.method, 'DELETE');
  });
});
