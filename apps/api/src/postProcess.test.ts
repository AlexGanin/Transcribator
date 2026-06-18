import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { postProcessTranscript } from './postProcess.js';

describe('post-process transcript safeguards', () => {
  it('removes long runs of identical short hallucination phrases', () => {
    const clean = postProcessTranscript([
      'Обсуждаем систему.',
      'Thank you.',
      'Thank you.',
      'Thank you.',
      'Thank you.',
      'Thank you.',
      'Переходим к следующему вопросу.'
    ].join(' '));

    assert.match(clean, /Обсуждаем систему\./);
    assert.match(clean, /Переходим к следующему вопросу\./);
    assert.doesNotMatch(clean, /Thank you/i);
  });

  it('keeps single short acknowledgements in normal dialogue', () => {
    const clean = postProcessTranscript('Да. Угу. Спасибо. Продолжаем обсуждение.');

    assert.match(clean, /Да\./);
    assert.match(clean, /Угу\./);
    assert.match(clean, /Спасибо\./);
    assert.match(clean, /Продолжаем обсуждение\./);
  });
});
