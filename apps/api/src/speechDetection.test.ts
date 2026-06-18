import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSpeechRanges,
  formatClipTimestamps,
  getTranscriptionVadConfig,
  parseSilencedetectOutput
} from './speechDetection.js';

describe('speech detection helpers', () => {
  it('parses ffmpeg silencedetect duration and silence ranges', () => {
    const parsed = parseSilencedetectOutput([
      'Input #0, wav, from "sample.wav":',
      '  Duration: 00:01:12.50, bitrate: 256 kb/s',
      '[silencedetect @ 0x1] silence_start: 0',
      '[silencedetect @ 0x1] silence_end: 2.25 | silence_duration: 2.25',
      '[silencedetect @ 0x1] silence_start: 10.5',
      '[silencedetect @ 0x1] silence_end: 12 | silence_duration: 1.5',
      '[silencedetect @ 0x1] silence_start: 70'
    ].join('\n'));

    assert.equal(parsed.durationSeconds, 72.5);
    assert.deepEqual(parsed.silenceRanges, [
      { start: 0, end: 2.25 },
      { start: 10.5, end: 12 },
      { start: 70, end: null }
    ]);
  });

  it('builds padded and merged speech ranges from silence ranges', () => {
    const ranges = buildSpeechRanges({
      durationSeconds: 10,
      silenceRanges: [
        { start: 0, end: 1 },
        { start: 3, end: 3.2 },
        { start: 6, end: 10 }
      ],
      config: {
        noiseDb: '-35dB',
        minSilenceSeconds: 1,
        speechPaddingSeconds: 0.25,
        minSpeechSeconds: 0.4
      }
    });

    assert.deepEqual(ranges, [{ start: 0.75, end: 6.25 }]);
    assert.equal(formatClipTimestamps(ranges), '0.75,6.25');
  });

  it('drops speech islands shorter than the configured minimum', () => {
    const ranges = buildSpeechRanges({
      durationSeconds: 8,
      silenceRanges: [
        { start: 0, end: 2 },
        { start: 2.2, end: 8 }
      ],
      config: {
        noiseDb: '-35dB',
        minSilenceSeconds: 1,
        speechPaddingSeconds: 0.25,
        minSpeechSeconds: 0.4
      }
    });

    assert.deepEqual(ranges, []);
    assert.equal(formatClipTimestamps(ranges), '');
  });

  it('reads VAD config from env-like values with safe defaults', () => {
    const config = getTranscriptionVadConfig({
      TRANSCRIBE_SILENCE_NOISE_DB: '-40dB',
      TRANSCRIBE_MIN_SILENCE_SECONDS: '1.5',
      TRANSCRIBE_SPEECH_PADDING_SECONDS: '0.1',
      TRANSCRIBE_MIN_SPEECH_SECONDS: '0.7'
    });

    assert.deepEqual(config, {
      noiseDb: '-40dB',
      minSilenceSeconds: 1.5,
      speechPaddingSeconds: 0.1,
      minSpeechSeconds: 0.7
    });
  });
});
