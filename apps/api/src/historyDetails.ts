import { access, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  screenshotFileNameSchema,
  type HistoryDetailResponse,
  type HistoryDeleteResponse,
  type HistoryScreenshot,
  type HistoryScreenshotScope,
  type HistoryScreenshotsOperationResponse,
  type HistoryScreenshotsRequest,
  type UpdateHistoryEntryRequest
} from '@transcribator/shared';
import { createHttpError } from './errors.js';
import {
  DEFAULT_RUNTIME_DIR,
  defaultTranscriptionStore,
  type ScreenshotRecord,
  type TranscriptionStore
} from './transcriptionStore.js';
import { generateTranscriptionMarkdown } from './markdownArtifacts.js';

export interface HistoryDetailsServiceOptions {
  store?: TranscriptionStore | undefined;
  runtimeDir?: string | undefined;
}

export interface HistoryDetailsService {
  get(id: string): Promise<HistoryDetailResponse>;
  update(id: string, patch: UpdateHistoryEntryRequest): Promise<HistoryDetailResponse>;
  formatWithAi(id: string): Promise<HistoryDetailResponse>;
  createMarkdown(id: string): Promise<HistoryDetailResponse>;
  deleteEntry(id: string): Promise<HistoryDeleteResponse>;
  trashScreenshots(id: string, payload: HistoryScreenshotsRequest): Promise<HistoryScreenshotsOperationResponse>;
  restoreScreenshots(id: string, payload: HistoryScreenshotsRequest): Promise<HistoryScreenshotsOperationResponse>;
  clearScreenshotsTrash(id: string): Promise<HistoryScreenshotsOperationResponse>;
  getScreenshotPath(id: string, scope: HistoryScreenshotScope, fileName: string): Promise<string>;
}

export const historyDetailsService = createHistoryDetailsService({
  store: defaultTranscriptionStore,
  runtimeDir: DEFAULT_RUNTIME_DIR
});

export function createHistoryDetailsService(options: HistoryDetailsServiceOptions = {}): HistoryDetailsService {
  const store = options.store || defaultTranscriptionStore;
  const runtimeDir = options.runtimeDir || DEFAULT_RUNTIME_DIR;

  return {
    async get(id) {
      return buildDetail(store, runtimeDir, id);
    },

    async update(id, patch) {
      ensureTranscriptionExists(store, id);
      const updated = store.patchTranscription(id, {
        title: patch.title,
        source: patch.source,
        engine: patch.engine,
        summary: patch.summary,
        cleanText: patch.cleanText,
        formattedText: patch.formattedText,
        rawText: patch.rawText
      });

      return buildDetail(store, runtimeDir, updated.id);
    },

    async formatWithAi(id) {
      const record = ensureTranscriptionExists(store, id);
      await delay(800);
      store.patchTranscription(id, {
        formattedText: record.formattedText || record.cleanText || record.rawText,
        summary: record.summary
      });

      return buildDetail(store, runtimeDir, id);
    },

    async createMarkdown(id) {
      ensureTranscriptionExists(store, id);
      return generateTranscriptionMarkdown({
        store,
        runtimeDir,
        transcriptionId: id
      });
    },

    async deleteEntry(id) {
      ensureTranscriptionExists(store, id);
      store.deleteTranscription(id);
      await rm(path.join(runtimeDir, 'artifacts', id), { recursive: true, force: true });
      return { id, deleted: true };
    },

    async trashScreenshots(id, payload) {
      ensureTranscriptionExists(store, id);
      const result = await moveScreenshots({
        store,
        runtimeDir,
        transcriptionId: id,
        fileNames: payload.fileNames,
        from: 'active',
        to: 'trash'
      });
      return {
        ...await buildDetail(store, runtimeDir, id),
        moved: result.moved,
        missing: result.missing,
        deleted: []
      };
    },

    async restoreScreenshots(id, payload) {
      ensureTranscriptionExists(store, id);
      const result = await moveScreenshots({
        store,
        runtimeDir,
        transcriptionId: id,
        fileNames: payload.fileNames,
        from: 'trash',
        to: 'active'
      });
      return {
        ...await buildDetail(store, runtimeDir, id),
        moved: result.moved,
        missing: result.missing,
        deleted: []
      };
    },

    async clearScreenshotsTrash(id) {
      ensureTranscriptionExists(store, id);
      const trashed = store.deleteTrashScreenshots(id);
      const deleted: string[] = [];

      for (const screenshot of trashed) {
        await rm(screenshot.path, { force: true });
        deleted.push(screenshot.fileName);
      }

      return {
        ...await buildDetail(store, runtimeDir, id),
        moved: [],
        missing: [],
        deleted
      };
    },

    async getScreenshotPath(id, scope, fileName) {
      const safeName = screenshotFileNameSchema.parse(fileName);
      const screenshot = store.getScreenshot(id, safeName);
      if (!screenshot || screenshot.status !== scope) {
        throw createHttpError(404, 'Screenshot not found.');
      }

      const expectedPath = screenshotPath(runtimeDir, id, scope, safeName);
      const safePath = assertInside(path.resolve(runtimeDir), path.resolve(screenshot.path || expectedPath));
      if (path.basename(safePath) !== safeName) {
        throw createHttpError(400, 'Invalid screenshot file path.');
      }

      if (!await fileExists(safePath)) {
        throw createHttpError(404, 'Screenshot file is missing.');
      }
      return safePath;
    }
  };
}

async function buildDetail(
  store: TranscriptionStore,
  runtimeDir: string,
  id: string
): Promise<HistoryDetailResponse> {
  const record = ensureTranscriptionExists(store, id);
  const screenshots = store.listScreenshots(id, 'active');
  const trashedScreenshots = store.listScreenshots(id, 'trash');

  return {
    entry: store.toHistoryEntry(record),
    screenshots: await toHistoryScreenshots(id, screenshots, 'active'),
    trashedScreenshots: await toHistoryScreenshots(id, trashedScreenshots, 'trash'),
    metadataPath: ''
  };
}

function ensureTranscriptionExists(store: TranscriptionStore, id: string) {
  const record = store.getTranscription(id);
  if (!record) {
    throw createHttpError(404, 'Transcription history entry not found.');
  }
  return record;
}

interface MoveScreenshotsOptions {
  store: TranscriptionStore;
  runtimeDir: string;
  transcriptionId: string;
  fileNames: string[];
  from: HistoryScreenshotScope;
  to: HistoryScreenshotScope;
}

async function moveScreenshots(options: MoveScreenshotsOptions): Promise<{ moved: string[]; missing: string[] }> {
  const moved: string[] = [];
  const missing: string[] = [];

  for (const fileName of options.fileNames) {
    const safeName = screenshotFileNameSchema.parse(fileName);
    const screenshot = options.store.getScreenshot(options.transcriptionId, safeName);
    if (!screenshot || screenshot.status !== options.from) {
      missing.push(safeName);
      continue;
    }

    const nextPath = screenshotPath(options.runtimeDir, options.transcriptionId, options.to, safeName);
    await mkdir(path.dirname(nextPath), { recursive: true });

    if (await fileExists(screenshot.path)) {
      await rename(screenshot.path, nextPath);
    } else {
      missing.push(safeName);
    }

    options.store.setScreenshotStatus(options.transcriptionId, safeName, options.to, nextPath);
    moved.push(safeName);
  }

  return { moved, missing };
}

function screenshotPath(
  runtimeDir: string,
  transcriptionId: string,
  scope: HistoryScreenshotScope,
  fileName: string
): string {
  const safeName = screenshotFileNameSchema.parse(fileName);
  return path.join(
    runtimeDir,
    'artifacts',
    transcriptionId,
    scope === 'active' ? 'screenshots' : path.join('trash', 'screenshots'),
    safeName
  );
}

async function toHistoryScreenshots(
  transcriptionId: string,
  screenshots: ScreenshotRecord[],
  scope: HistoryScreenshotScope
): Promise<HistoryScreenshot[]> {
  return Promise.all(screenshots.map(async (screenshot) => ({
    fileName: screenshot.fileName,
    timestampSeconds: screenshot.timestampSeconds,
    exists: await fileExists(screenshot.path),
    url: `/transcribe/history/${encodeURIComponent(transcriptionId)}/screenshots/${scope}/${encodeURIComponent(screenshot.fileName)}`
  })));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertInside(root: string, target: string): string {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw createHttpError(400, 'Invalid screenshot file path.');
  }
  return target;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
