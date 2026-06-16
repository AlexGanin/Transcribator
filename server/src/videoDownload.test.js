import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFormats, safeDownloadFileName } from './videoDownload.js';

test('normalizeFormats returns user-facing video formats sorted by quality', () => {
  const formats = normalizeFormats([
    {
      format_id: '18',
      ext: 'mp4',
      resolution: '640x360',
      height: 360,
      width: 640,
      fps: 30,
      filesize: 1024 * 1024 * 12,
      vcodec: 'avc1',
      acodec: 'mp4a'
    },
    {
      format_id: '140',
      ext: 'm4a',
      resolution: 'audio only',
      vcodec: 'none',
      acodec: 'mp4a'
    },
    {
      format_id: '22',
      ext: 'mp4',
      resolution: '1280x720',
      height: 720,
      width: 1280,
      fps: 30,
      filesize_approx: 1024 * 1024 * 42,
      vcodec: 'avc1',
      acodec: 'mp4a'
    }
  ]);

  assert.deepEqual(formats, [
    {
      id: '22',
      label: '720p · mp4 · 30fps · ~42 MB',
      ext: 'mp4',
      resolution: '1280x720',
      height: 720,
      width: 1280,
      fps: 30,
      sizeLabel: '~42 MB',
      hasAudio: true,
      hasVideo: true
    },
    {
      id: '18',
      label: '360p · mp4 · 30fps · 12 MB',
      ext: 'mp4',
      resolution: '640x360',
      height: 360,
      width: 640,
      fps: 30,
      sizeLabel: '12 MB',
      hasAudio: true,
      hasVideo: true
    }
  ]);
});

test('safeDownloadFileName removes unsafe path characters and keeps extension', () => {
  assert.equal(safeDownloadFileName('../My: Video / Demo?', 'mp4'), 'My_Video_Demo.mp4');
  assert.equal(safeDownloadFileName('', 'webm'), 'video.webm');
});
