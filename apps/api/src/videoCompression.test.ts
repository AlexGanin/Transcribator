import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCompressedFileName,
  parseFfmpegProgress,
  selectCompressionPreset
} from './videoCompression.js';

describe('video compression helpers', () => {
  it('selects the balanced preset as the default ffmpeg profile', () => {
    assert.deepEqual(selectCompressionPreset('balanced'), {
      id: 'balanced',
      label: 'Баланс',
      crf: 23,
      audioBitrate: '160k'
    });
  });

  it('builds a safe and readable mp4 output file name', () => {
    assert.equal(
      buildCompressedFileName('My Interview / Screen.mov', 'small', '2026-06-17T20-10-00-000Z'),
      'My_Interview_Screen-small-compressed-2026-06-17T20-10-00-000Z.mp4'
    );
  });

  it('parses ffmpeg progress from out_time_ms', () => {
    assert.equal(parseFfmpegProgress('out_time_ms=5000000', 10), 50);
  });

  it('parses ffmpeg progress from out_time', () => {
    assert.equal(parseFfmpegProgress('out_time=00:00:07.500000', 10), 75);
  });
});
