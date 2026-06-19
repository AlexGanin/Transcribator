import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { generateTranscriptionMarkdown } from './markdownArtifacts.js';
import { createTranscriptionStore } from './transcriptionStore.js';

describe('Markdown artifacts', () => {
  it('generates Markdown from formatted text, summary and active screenshots only', async () => {
    const fixture = await createMarkdownFixture();
    const screenshotDir = path.join(fixture.runtimeDir, 'artifacts', 'job-1', 'screenshots');
    const trashDir = path.join(fixture.runtimeDir, 'artifacts', 'job-1', 'trash', 'screenshots');
    await mkdir(screenshotDir, { recursive: true });
    await mkdir(trashDir, { recursive: true });
    await writeFile(path.join(screenshotDir, '0001-00-00-30.jpg'), 'active-image');
    await writeFile(path.join(trashDir, '0002-00-01-00.jpg'), 'trashed-image');

    fixture.store.upsertTranscription({
      id: 'job-1',
      status: 'done',
      source: 'interview.mov',
      sourceType: 'file',
      engine: 'mlx-whisper',
      rawText: 'Raw transcript.',
      cleanText: 'Clean transcript.',
      formattedText: 'Formatted transcript.',
      summary: 'Short summary.',
      createdAt: 1781769629908,
      finishedAt: 1781769703001
    });
    fixture.store.addScreenshots('job-1', [
      {
        fileName: '0001-00-00-30.jpg',
        timestampSeconds: 30,
        path: path.join(screenshotDir, '0001-00-00-30.jpg')
      },
      {
        fileName: '0002-00-01-00.jpg',
        timestampSeconds: 60,
        path: path.join(trashDir, '0002-00-01-00.jpg'),
        status: 'trash'
      }
    ]);

    const detail = await generateTranscriptionMarkdown({
      store: fixture.store,
      runtimeDir: fixture.runtimeDir,
      transcriptionId: 'job-1'
    });

    assert.equal(detail.entry.markdownPath, path.join(fixture.runtimeDir, 'artifacts', 'job-1', 'transcript.md'));
    const markdown = await readFile(detail.entry.markdownPath, 'utf8');
    assert.match(markdown, /^# interview\.mov/);
    assert.match(markdown, /## Краткое содержание\n\nShort summary\./);
    assert.match(markdown, /## Транскрипция\n\nFormatted transcript\./);
    assert.match(markdown, /!\[\[screenshots\/0001-00-00-30.jpg\]\]/);
    assert.doesNotMatch(markdown, /0002-00-01-00\.jpg/);
    assert.doesNotMatch(markdown, /Clean transcript/);
    assert.doesNotMatch(markdown, /Raw transcript/);
  });

  it('omits summary section when SQLite summary is empty and falls back to clean text', async () => {
    const fixture = await createMarkdownFixture();
    fixture.store.upsertTranscription({
      id: 'job-2',
      status: 'done',
      source: 'https://example.com/video',
      sourceType: 'url',
      engine: 'openai-whisper',
      rawText: 'Raw transcript.',
      cleanText: 'Clean transcript.',
      formattedText: '',
      summary: '',
      createdAt: 1781769629908,
      finishedAt: 1781769703001
    });

    const detail = await generateTranscriptionMarkdown({
      store: fixture.store,
      runtimeDir: fixture.runtimeDir,
      transcriptionId: 'job-2'
    });
    const markdown = await readFile(detail.entry.markdownPath, 'utf8');

    assert.doesNotMatch(markdown, /## Краткое содержание/);
    assert.match(markdown, /## Транскрипция\n\nClean transcript\./);
  });
});

async function createMarkdownFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'transcribator-md-'));
  const runtimeDir = path.join(root, 'runtime');
  const dbPath = path.join(runtimeDir, 'transcribator.sqlite');
  await mkdir(runtimeDir, { recursive: true });
  const store = createTranscriptionStore({ dbPath });
  return { root, runtimeDir, store };
}
