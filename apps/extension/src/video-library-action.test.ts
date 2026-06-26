import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADD_VIDEO_BUTTON_LABEL, buildYouTubeVideoCreateInput } from './video-library-action.js';

describe('extension video library action helpers', () => {
  it('uses an explicit add-video label for the library-only action', () => {
    assert.equal(ADD_VIDEO_BUTTON_LABEL, 'Добавить видео');
  });

  it('builds a YouTube video library payload without transcription settings', () => {
    assert.deepEqual(
      buildYouTubeVideoCreateInput({
        url: 'https://youtu.be/dQw4w9WgXcQ?si=abc',
        title: 'Видео - YouTube'
      }),
      {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Видео',
        channelTitle: '',
        thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
      }
    );
  });

  it('returns null for non-YouTube URLs', () => {
    assert.equal(buildYouTubeVideoCreateInput({ url: 'https://example.com/video' }), null);
  });
});
