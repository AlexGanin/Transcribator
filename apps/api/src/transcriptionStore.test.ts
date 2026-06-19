import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createTranscriptionStore, migrateHistoryJsonToSqlite } from './transcriptionStore.js';

describe('transcription SQLite store', () => {
  it('stores raw, clean and formatted transcript fields in SQLite history', async () => {
    const fixture = await createStoreFixture();

    fixture.store.upsertTranscription({
      id: 'job-1',
      status: 'running',
      source: 'interview.mov',
      sourceType: 'file',
      engine: 'mlx-whisper',
      rawText: 'Raw whisper text.',
      createdAt: 1781769629908
    });
    fixture.store.patchTranscription('job-1', {
      status: 'done',
      cleanText: 'Clean transcript.',
      formattedText: 'Formatted transcript.',
      summary: '',
      finishedAt: 1781769703001
    });

    const [entry] = fixture.store.listHistory();

    assert.equal(entry.id, 'job-1');
    assert.equal(entry.source, 'interview.mov');
    assert.equal(entry.sourceType, 'file');
    assert.equal(entry.engine, 'mlx-whisper');
    assert.equal(entry.rawText, 'Raw whisper text.');
    assert.equal(entry.cleanText, 'Clean transcript.');
    assert.equal(entry.formattedText, 'Formatted transcript.');
    assert.equal(entry.summary, '');
    assert.equal(entry.outputPath, '');
    assert.equal(entry.markdownPath, '');
    assert.equal(entry.status, 'done');
  });

  it('moves screenshots between active and trash statuses without losing file paths', async () => {
    const fixture = await createStoreFixture();

    fixture.store.upsertTranscription({
      id: 'job-1',
      status: 'done',
      source: 'https://example.com/video',
      sourceType: 'url',
      createdAt: 1781769629908,
      finishedAt: 1781769703001
    });
    fixture.store.addScreenshots('job-1', [
      {
        fileName: '0001-00-00-30.jpg',
        timestampSeconds: 30,
        path: path.join(fixture.root, 'runtime', 'artifacts', 'job-1', 'screenshots', '0001-00-00-30.jpg')
      },
      {
        fileName: '0002-00-01-00.jpg',
        timestampSeconds: 60,
        path: path.join(fixture.root, 'runtime', 'artifacts', 'job-1', 'screenshots', '0002-00-01-00.jpg')
      }
    ]);

    fixture.store.setScreenshotStatus('job-1', '0001-00-00-30.jpg', 'trash', path.join(
      fixture.root,
      'runtime',
      'artifacts',
      'job-1',
      'trash',
      'screenshots',
      '0001-00-00-30.jpg'
    ));

    assert.deepEqual(
      fixture.store.listScreenshots('job-1', 'active').map((item) => item.fileName),
      ['0002-00-01-00.jpg']
    );
    assert.deepEqual(
      fixture.store.listScreenshots('job-1', 'trash').map((item) => [item.fileName, item.timestampSeconds]),
      [['0001-00-00-30.jpg', 30]]
    );

    const [entry] = fixture.store.listHistory();
    assert.equal(entry.screenshotsCount, 1);
  });

  it('migrates existing history.json entries and Obsidian metadata into SQLite', async () => {
    const fixture = await createStoreFixture();
    const historyPath = path.join(fixture.root, 'runtime', 'output', 'history.json');
    const obsidianFolderPath = path.join(fixture.root, 'runtime', 'obsidian', 'video-hash');
    await mkdir(obsidianFolderPath, { recursive: true });
    await writeFile(path.join(obsidianFolderPath, 'metadata.json'), JSON.stringify({
      screenshots: [
        { fileName: '0001-00-00-30.jpg', timestampSeconds: 30 }
      ],
      trashedScreenshots: [
        { fileName: '0002-00-01-00.jpg', timestampSeconds: 60 }
      ]
    }), 'utf8');
    await mkdir(path.dirname(historyPath), { recursive: true });
    await writeFile(historyPath, JSON.stringify([
      {
        id: 'legacy-job',
        status: 'done',
        title: 'Legacy title',
        sourceType: 'url',
        source: 'https://example.com/video',
        engine: 'mlx-whisper',
        startedAt: 1781769629908,
        finishedAt: 1781769703001,
        elapsedSeconds: 73,
        stages: [],
        outputPath: path.join(fixture.root, 'runtime', 'output', 'legacy.txt'),
        markdownPath: path.join(obsidianFolderPath, 'transcript.md'),
        obsidianFolderPath,
        screenshotsCount: 2,
        summary: 'Legacy summary.',
        cleanText: 'Legacy clean text.',
        rawText: 'Legacy raw text.',
        error: ''
      }
    ], null, 2), 'utf8');

    await migrateHistoryJsonToSqlite({ store: fixture.store, historyPath });

    const [entry] = fixture.store.listHistory();
    assert.equal(entry.id, 'legacy-job');
    assert.equal(entry.title, 'Legacy title');
    assert.equal(entry.rawText, 'Legacy raw text.');
    assert.equal(entry.cleanText, 'Legacy clean text.');
    assert.equal(entry.summary, 'Legacy summary.');
    assert.equal(entry.markdownPath, path.join(obsidianFolderPath, 'transcript.md'));
    assert.deepEqual(
      fixture.store.listScreenshots('legacy-job', 'active').map((item) => item.fileName),
      ['0001-00-00-30.jpg']
    );
    assert.deepEqual(
      fixture.store.listScreenshots('legacy-job', 'trash').map((item) => item.fileName),
      ['0002-00-01-00.jpg']
    );
  });

  it('persists records between store instances', async () => {
    const fixture = await createStoreFixture();

    fixture.store.upsertTranscription({
      id: 'job-1',
      status: 'done',
      source: 'persisted.mov',
      sourceType: 'file',
      rawText: 'Persisted raw.',
      cleanText: 'Persisted clean.',
      createdAt: 1781769629908,
      finishedAt: 1781769703001
    });
    fixture.store.close();

    const reopened = createTranscriptionStore({ dbPath: fixture.dbPath });
    assert.equal(reopened.getTranscription('job-1')?.cleanText, 'Persisted clean.');
    reopened.close();
  });
});

async function createStoreFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'transcribator-sqlite-'));
  const dbPath = path.join(root, 'runtime', 'transcribator.sqlite');
  await mkdir(path.dirname(dbPath), { recursive: true });
  const store = createTranscriptionStore({ dbPath });
  return { root, dbPath, store };
}
