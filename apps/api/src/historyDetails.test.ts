import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createHistoryDetailsService } from './historyDetails.js';
import { createTranscriptionStore } from './transcriptionStore.js';

const STARTED_AT = 1781769629908;
const FINISHED_AT = 1781769703001;

describe('history detail SQLite operations', () => {
  it('updates editable text fields in SQLite without rewriting Markdown artifacts', async () => {
    const fixture = await createHistoryFixture();

    const detail = await fixture.service.update('job-1', {
      title: 'Edited transcript title',
      source: 'https://example.com/edited-video',
      engine: 'openai',
      summary: 'Edited summary.',
      formattedText: 'Edited formatted text.',
      cleanText: 'Edited clean text.',
      rawText: 'Edited raw text.'
    });

    assert.equal(detail.entry.title, 'Edited transcript title');
    assert.equal(detail.entry.source, 'https://example.com/edited-video');
    assert.equal(detail.entry.engine, 'openai');
    assert.equal(detail.entry.summary, 'Edited summary.');
    assert.equal(detail.entry.formattedText, 'Edited formatted text.');
    assert.equal(detail.entry.cleanText, 'Edited clean text.');
    assert.equal(detail.entry.rawText, 'Edited raw text.');
    assert.equal(fixture.store.getTranscription('job-1')?.formattedText, 'Edited formatted text.');
    assert.equal(await readFile(fixture.markdownPath, 'utf8'), 'old markdown');
  });

  it('moves selected active screenshots to trash and updates SQLite state', async () => {
    const fixture = await createHistoryFixture();

    const detail = await fixture.service.trashScreenshots('job-1', {
      fileNames: ['0001-00-00-30.jpg']
    });

    assert.equal(await exists(path.join(fixture.screenshotsDir, '0001-00-00-30.jpg')), false);
    assert.equal(await exists(path.join(fixture.trashScreenshotsDir, '0001-00-00-30.jpg')), true);
    assert.deepEqual(detail.moved, ['0001-00-00-30.jpg']);
    assert.deepEqual(detail.screenshots.map((item) => item.fileName), ['0002-00-01-00.jpg']);
    assert.deepEqual(detail.trashedScreenshots.map((item) => item.fileName), ['0001-00-00-30.jpg']);
    assert.equal(fixture.store.listHistory()[0]?.screenshotsCount, 1);
  });

  it('restores selected screenshots from trash back to active gallery', async () => {
    const fixture = await createHistoryFixture();
    await fixture.service.trashScreenshots('job-1', {
      fileNames: ['0001-00-00-30.jpg']
    });

    const detail = await fixture.service.restoreScreenshots('job-1', {
      fileNames: ['0001-00-00-30.jpg']
    });

    assert.equal(await exists(path.join(fixture.screenshotsDir, '0001-00-00-30.jpg')), true);
    assert.equal(await exists(path.join(fixture.trashScreenshotsDir, '0001-00-00-30.jpg')), false);
    assert.deepEqual(detail.moved, ['0001-00-00-30.jpg']);
    assert.deepEqual(detail.screenshots.map((item) => item.fileName), [
      '0001-00-00-30.jpg',
      '0002-00-01-00.jpg'
    ]);
    assert.deepEqual(detail.trashedScreenshots, []);
  });

  it('clears trash by physically deleting files and removing trash rows', async () => {
    const fixture = await createHistoryFixture();
    await fixture.service.trashScreenshots('job-1', {
      fileNames: ['0001-00-00-30.jpg']
    });

    const detail = await fixture.service.clearScreenshotsTrash('job-1');

    assert.equal(await exists(path.join(fixture.trashScreenshotsDir, '0001-00-00-30.jpg')), false);
    assert.deepEqual(detail.deleted, ['0001-00-00-30.jpg']);
    assert.deepEqual(detail.trashedScreenshots, []);
    assert.equal(fixture.store.listScreenshots('job-1', 'trash').length, 0);
  });

  it('deletes a history entry from SQLite and removes its artifacts without touching source media', async () => {
    const fixture = await createHistoryFixture();

    const result = await fixture.service.deleteEntry('job-1');

    assert.deepEqual(result, { id: 'job-1', deleted: true });
    assert.equal(fixture.store.getTranscription('job-1'), null);
    assert.deepEqual(fixture.store.listHistory(), []);
    assert.deepEqual(fixture.store.listScreenshots('job-1'), []);
    assert.equal(await exists(fixture.artifactsDir), false);
    assert.equal(await exists(fixture.sourceFilePath), true);
  });

  it('rejects unsafe screenshot file names before touching the filesystem', async () => {
    const fixture = await createHistoryFixture();

    await assert.rejects(
      () => fixture.service.trashScreenshots('job-1', { fileNames: ['../0001-00-00-30.jpg'] }),
      /Invalid screenshot file name/
    );

    assert.equal(await exists(path.join(fixture.screenshotsDir, '0001-00-00-30.jpg')), true);
    assert.equal(await exists(path.join(fixture.trashScreenshotsDir, '0001-00-00-30.jpg')), false);
  });

  it('returns missing screenshot files as exists=false instead of failing detail loading', async () => {
    const fixture = await createHistoryFixture();
    await writeFile(path.join(fixture.screenshotsDir, '0003-00-01-30.jpg'), 'third-image');
    fixture.store.addScreenshots('job-1', [
      {
        fileName: '0003-00-01-30.jpg',
        timestampSeconds: 90,
        path: path.join(fixture.screenshotsDir, '0003-00-01-30.jpg')
      }
    ]);
    await fixture.service.trashScreenshots('job-1', { fileNames: ['0003-00-01-30.jpg'] });
    const missingPath = path.join(fixture.trashScreenshotsDir, '0003-00-01-30.jpg');
    await import('node:fs/promises').then(({ rm }) => rm(missingPath, { force: true }));

    const detail = await fixture.service.get('job-1');
    const missing = detail.trashedScreenshots.find((item) => item.fileName === '0003-00-01-30.jpg');

    assert.equal(missing?.exists, false);
  });
});

async function createHistoryFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'transcribator-history-sqlite-'));
  const runtimeDir = path.join(root, 'runtime');
  const store = createTranscriptionStore({ dbPath: path.join(runtimeDir, 'transcribator.sqlite') });
  const artifactsDir = path.join(runtimeDir, 'artifacts', 'job-1');
  const sourceDir = path.join(runtimeDir, 'source');
  const sourceFilePath = path.join(sourceDir, 'uploaded-source.mp4');
  const screenshotsDir = path.join(artifactsDir, 'screenshots');
  const trashScreenshotsDir = path.join(artifactsDir, 'trash', 'screenshots');
  const markdownPath = path.join(artifactsDir, 'transcript.md');

  await mkdir(screenshotsDir, { recursive: true });
  await mkdir(trashScreenshotsDir, { recursive: true });
  await mkdir(sourceDir, { recursive: true });
  await writeFile(path.join(screenshotsDir, '0001-00-00-30.jpg'), 'first-image');
  await writeFile(path.join(screenshotsDir, '0002-00-01-00.jpg'), 'second-image');
  await writeFile(markdownPath, 'old markdown', 'utf8');
  await writeFile(sourceFilePath, 'source-video');

  store.upsertTranscription({
    id: 'job-1',
    status: 'done',
    title: 'Original title',
    sourceType: 'url',
    source: 'https://example.com/video',
    engine: 'mlx-whisper',
    rawText: 'Original raw text.',
    cleanText: 'Original clean text.',
    formattedText: '',
    summary: '',
    markdownPath,
    createdAt: STARTED_AT,
    updatedAt: FINISHED_AT,
    finishedAt: FINISHED_AT
  });
  store.addScreenshots('job-1', [
    {
      fileName: '0001-00-00-30.jpg',
      timestampSeconds: 30,
      path: path.join(screenshotsDir, '0001-00-00-30.jpg')
    },
    {
      fileName: '0002-00-01-00.jpg',
      timestampSeconds: 60,
      path: path.join(screenshotsDir, '0002-00-01-00.jpg')
    }
  ]);

  return {
    service: createHistoryDetailsService({ store, runtimeDir }),
    store,
    root,
    runtimeDir,
    artifactsDir,
    sourceFilePath,
    screenshotsDir,
    trashScreenshotsDir,
    markdownPath
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
