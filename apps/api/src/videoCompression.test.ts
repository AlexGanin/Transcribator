import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFfmpegCompressionArgs,
  buildCompressedFileName,
  parseFfmpegProgress,
  selectCompressionPreset
} from './videoCompression.js';

describe('video compression helpers', () => {
  it('selects the balanced preset as the default ffmpeg profile', () => {
    assert.deepEqual(selectCompressionPreset('balanced'), {
      id: 'balanced',
      label: 'Баланс',
      videoBitrate: '3500k',
      audioBitrate: '128k'
    });
  });

  it('builds ffmpeg args for Apple VideoToolbox HEVC compression', () => {
    const args = buildFfmpegCompressionArgs('/tmp/input.mov', '/tmp/output.mp4', selectCompressionPreset('small'), {
      width: 3248,
      height: 2000
    });

    assert.deepEqual(args.slice(0, 6), [
      '-y',
      '-hide_banner',
      '-v',
      'error',
      '-i',
      '/tmp/input.mov'
    ]);
    assert.equal(args[args.indexOf('-c:v') + 1], 'hevc_videotoolbox');
    assert.equal(args[args.indexOf('-b:v') + 1], '2500k');
    assert.equal(args[args.indexOf('-tag:v') + 1], 'hvc1');
    assert.equal(args[args.indexOf('-profile:v') + 1], 'main');
    assert.equal(args[args.indexOf('-allow_sw') + 1], '0');
    assert.equal(args[args.indexOf('-prio_speed') + 1], '1');
    assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p');
    assert.equal(args[args.indexOf('-b:a') + 1], '96k');
    assert.equal(args.includes('-vf'), false);
    assert.equal(args.includes('libx264'), false);
    assert.equal(args.includes('h264_videotoolbox'), false);
    assert.equal(args.includes('-crf'), false);
    assert.equal(args.includes('-preset'), false);
  });

  it('keeps the even-dimension scale filter only for odd-sized input videos', () => {
    const args = buildFfmpegCompressionArgs('/tmp/input.mov', '/tmp/output.mp4', selectCompressionPreset('balanced'), {
      width: 1919,
      height: 1079
    });

    assert.equal(args[args.indexOf('-vf') + 1], 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
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
