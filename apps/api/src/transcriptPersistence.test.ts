import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { persistTranscriptText } from './transcriptPersistence.js';
import { createTranscriptionStore } from './transcriptionStore.js';

describe('pipeline transcript persistence', () => {
  it('saves raw and clean transcript to SQLite without creating final txt output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'transcribator-pipeline-'));
    const dbPath = path.join(root, 'runtime', 'transcribator.sqlite');
    await mkdir(path.dirname(dbPath), { recursive: true });
    const store = createTranscriptionStore({ dbPath });

    const result = persistTranscriptText({
      store,
      transcriptionId: 'job-1',
      createdAt: 1781769629908,
      rawText: '  Hello from Whisper.  \n\nThank you.\nThank you.\nThank you.\nThank you.\nThank you. ',
      meta: {
        source: 'interview.mov',
        sourceType: 'file',
        engine: 'mlx-whisper',
        videoHash: 'video-hash'
      }
    });

    const entry = store.getTranscription('job-1');

    assert.equal(entry?.rawText, 'Hello from Whisper.\n\nThank you.\nThank you.\nThank you.\nThank you.\nThank you.');
    assert.equal(entry?.cleanText, result.cleanText);
    assert.match(entry?.cleanText || '', /Hello from Whisper\./);
    assert.equal(entry?.summary, '');
    assert.equal(entry?.formattedText, '');
    assert.equal(result.summary, '');
    assert.equal(result.formattedText, '');
    assert.equal('outputPath' in result, false);
  });
});
