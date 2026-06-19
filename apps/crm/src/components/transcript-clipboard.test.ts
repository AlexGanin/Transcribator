import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCleanTranscriptClipboardText } from './transcript-clipboard.js';

describe('transcript clipboard helpers', () => {
  it('copies the clean transcript text without surrounding whitespace', () => {
    assert.equal(
      buildCleanTranscriptClipboardText('  Первый абзац.\n\nВторой абзац.  '),
      'Первый абзац.\n\nВторой абзац.'
    );
  });
});
