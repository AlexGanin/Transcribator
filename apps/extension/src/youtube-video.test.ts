import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildYouTubeThumbnailUrl,
  extractYouTubeVideoId,
  readYouTubeVideoMetadata
} from './youtube-video.js';

describe('YouTube extension helpers', () => {
  it('extracts video ids from common YouTube URL shapes', () => {
    assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'), 'dQw4w9WgXcQ');
    assert.equal(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'dQw4w9WgXcQ');
    assert.equal(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(extractYouTubeVideoId('https://www.youtube.com/feed/subscriptions'), null);
  });

  it('builds a stable thumbnail URL from a video id', () => {
    assert.equal(
      buildYouTubeThumbnailUrl('dQw4w9WgXcQ'),
      'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    );
  });

  it('reads channel title from YouTube player metadata when owner markup is unavailable', () => {
    const doc = {
      title: 'Видео из вкладки - YouTube',
      querySelector: () => null,
      querySelectorAll: () => [
        {
          textContent: 'var ytInitialPlayerResponse = {"videoDetails":{"author":"Канал из player response"}};'
        }
      ]
    } as unknown as Document;

    const metadata = readYouTubeVideoMetadata(doc, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    assert.equal(metadata?.channelTitle, 'Канал из player response');
  });
});
