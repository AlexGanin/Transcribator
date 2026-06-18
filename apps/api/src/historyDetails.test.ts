import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createHistoryDetailsService } from './historyDetails.js';

const STARTED_AT = 1781769629908;
const FINISHED_AT = 1781769703001;

describe('history detail file operations', () => {
  it('updates history entry text fields and syncs Obsidian metadata and Markdown', async () => {
    const fixture = await createHistoryFixture();

    const detail = await fixture.service.update('job-1', {
      title: 'Edited transcript title',
      source: 'https://example.com/edited-video',
      engine: 'openai',
      summary: 'Edited summary.',
      cleanText: 'Edited clean text. Second edited sentence.',
      rawText: 'Edited raw text.'
    });

    assert.equal(detail.entry.title, 'Edited transcript title');
    assert.equal(detail.entry.source, 'https://example.com/edited-video');
    assert.equal(detail.entry.engine, 'openai');
    assert.equal(detail.entry.summary, 'Edited summary.');
    assert.equal(detail.entry.cleanText, 'Edited clean text. Second edited sentence.');
    assert.equal(detail.entry.rawText, 'Edited raw text.');

    const history = await readJsonFile(fixture.historyPath);
    assert.equal(history[0].title, 'Edited transcript title');
    assert.equal(history[0].summary, 'Edited summary.');
    assert.equal(history[0].cleanText, 'Edited clean text. Second edited sentence.');
    assert.equal(history[0].rawText, 'Edited raw text.');

    const metadata = await readJsonFile(fixture.metadataPath);
    assert.equal(metadata.title, 'Edited transcript title');
    assert.equal(metadata.source, 'https://example.com/edited-video');
    assert.equal(metadata.engine, 'openai');
    assert.equal(metadata.summary, 'Edited summary.');
    assert.equal(metadata.cleanText, 'Edited clean text. Second edited sentence.');
    assert.equal(metadata.rawText, 'Edited raw text.');
    assert.deepEqual(metadata.trashedScreenshots, []);

    const markdown = await readFile(fixture.markdownPath, 'utf8');
    assert.match(markdown, /^# Edited transcript title/);
    assert.match(markdown, /Edited summary\./);
    assert.match(markdown, /Edited clean text\. Second edited sentence\./);
    assert.match(markdown, /!\[\[screenshots\/0001-00-00-30.jpg\]\]/);
    assert.doesNotMatch(markdown, /Edited raw text/);
  });

  it('moves selected active screenshots to trash and excludes them from Markdown', async () => {
    const fixture = await createHistoryFixture();

    const detail = await fixture.service.trashScreenshots('job-1', {
      fileNames: ['0001-00-00-30.jpg']
    });

    assert.equal(await exists(path.join(fixture.screenshotsDir, '0001-00-00-30.jpg')), false);
    assert.equal(await exists(path.join(fixture.trashScreenshotsDir, '0001-00-00-30.jpg')), true);
    assert.deepEqual(detail.screenshots.map((item) => item.fileName), ['0002-00-01-00.jpg']);
    assert.deepEqual(detail.trashedScreenshots.map((item) => item.fileName), ['0001-00-00-30.jpg']);

    const history = await readJsonFile(fixture.historyPath);
    assert.equal(history[0].screenshotsCount, 1);

    const metadata = await readJsonFile(fixture.metadataPath);
    assert.deepEqual(metadata.screenshots.map((item: { fileName: string }) => item.fileName), ['0002-00-01-00.jpg']);
    assert.deepEqual(metadata.trashedScreenshots.map((item: { fileName: string }) => item.fileName), ['0001-00-00-30.jpg']);

    const markdown = await readFile(fixture.markdownPath, 'utf8');
    assert.doesNotMatch(markdown, /0001-00-00-30\.jpg/);
    assert.match(markdown, /0002-00-01-00\.jpg/);
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
    assert.deepEqual(detail.screenshots.map((item) => item.fileName), ['0001-00-00-30.jpg', '0002-00-01-00.jpg']);
    assert.deepEqual(detail.trashedScreenshots, []);

    const metadata = await readJsonFile(fixture.metadataPath);
    assert.deepEqual(metadata.screenshots.map((item: { fileName: string }) => item.fileName), [
      '0001-00-00-30.jpg',
      '0002-00-01-00.jpg'
    ]);
    assert.deepEqual(metadata.trashedScreenshots, []);

    const markdown = await readFile(fixture.markdownPath, 'utf8');
    assert.match(markdown, /0001-00-00-30\.jpg/);
  });

  it('clears trash by physically deleting trashed screenshot files', async () => {
    const fixture = await createHistoryFixture();
    await fixture.service.trashScreenshots('job-1', {
      fileNames: ['0001-00-00-30.jpg']
    });

    const detail = await fixture.service.clearScreenshotsTrash('job-1');

    assert.equal(await exists(path.join(fixture.trashScreenshotsDir, '0001-00-00-30.jpg')), false);
    assert.deepEqual(detail.trashedScreenshots, []);

    const metadata = await readJsonFile(fixture.metadataPath);
    assert.deepEqual(metadata.trashedScreenshots, []);
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
});

async function createHistoryFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'transcribator-history-'));
  const historyPath = path.join(root, 'runtime', 'output', 'history.json');
  const obsidianRoot = path.join(root, 'runtime', 'obsidian');
  const obsidianFolderPath = path.join(obsidianRoot, 'video-hash');
  const screenshotsDir = path.join(obsidianFolderPath, 'screenshots');
  const trashScreenshotsDir = path.join(obsidianFolderPath, 'trash', 'screenshots');
  const metadataPath = path.join(obsidianFolderPath, 'metadata.json');
  const markdownPath = path.join(obsidianFolderPath, 'transcript.md');

  await mkdir(path.dirname(historyPath), { recursive: true });
  await mkdir(screenshotsDir, { recursive: true });
  await writeFile(path.join(screenshotsDir, '0001-00-00-30.jpg'), 'first-image');
  await writeFile(path.join(screenshotsDir, '0002-00-01-00.jpg'), 'second-image');

  await writeFile(historyPath, JSON.stringify([
    {
      id: 'job-1',
      status: 'done',
      sourceType: 'url',
      source: 'https://example.com/video',
      engine: 'mlx-whisper',
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      elapsedSeconds: 73,
      stages: [],
      outputPath: path.join(root, 'runtime', 'output', 'job-1.txt'),
      markdownPath,
      obsidianFolderPath,
      screenshotsCount: 2,
      summary: 'Original summary.',
      cleanText: 'Original clean text.',
      rawText: 'Original raw text.',
      error: ''
    }
  ], null, 2), 'utf8');

  await writeFile(metadataPath, JSON.stringify({
    source: 'https://example.com/video',
    sourceType: 'url',
    engine: 'mlx-whisper',
    createdAt: new Date(STARTED_AT).toISOString(),
    videoHash: 'video-hash',
    screenshotsEnabled: true,
    screenshotIntervalSeconds: 30,
    screenshotsCount: 2,
    screenshots: [
      { fileName: '0001-00-00-30.jpg', timestampSeconds: 30 },
      { fileName: '0002-00-01-00.jpg', timestampSeconds: 60 }
    ],
    aiSelection: {
      enabled: false,
      selectedScreenshotIds: []
    }
  }, null, 2), 'utf8');
  await writeFile(markdownPath, 'old markdown', 'utf8');

  return {
    service: createHistoryDetailsService({ historyPath, obsidianRoot }),
    root,
    historyPath,
    obsidianRoot,
    obsidianFolderPath,
    screenshotsDir,
    trashScreenshotsDir,
    metadataPath,
    markdownPath
  };
}

async function readJsonFile(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
