import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildWhisperArgs } from './whisperArgs.js';

describe('whisper args builder', () => {
  it('replaces input, outputDir and clip timestamp placeholders', () => {
    assert.deepEqual(
      buildWhisperArgs('{input} --clip-timestamps {clipTimestamps} -o {outputDir}', {
        input: 'audio.wav',
        outputDir: '/tmp/out',
        clipTimestamps: '1.5,4,8,10'
      }),
      ['audio.wav', '--clip-timestamps', '1.5,4,8,10', '-o', '/tmp/out']
    );
  });

  it('drops clip timestamp flags when fallback runs without clips', () => {
    assert.deepEqual(
      buildWhisperArgs('{input} --clip_timestamps {clipTimestamps} --output_dir {outputDir}', {
        input: 'audio.wav',
        outputDir: '/tmp/out',
        clipTimestamps: ''
      }),
      ['audio.wav', '--output_dir', '/tmp/out']
    );
  });
});
