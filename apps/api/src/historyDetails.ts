import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  historyDetailResponseSchema,
  historyEntrySchema,
  historyScreenshotsOperationResponseSchema,
  historyScreenshotsRequestSchema,
  screenshotFileNameSchema,
  updateHistoryEntryRequestSchema,
  type HistoryDetailResponse,
  type HistoryEntry,
  type HistoryScreenshot,
  type HistoryScreenshotsOperationResponse,
  type HistoryScreenshotsRequest,
  type HistoryScreenshotScope,
  type UpdateHistoryEntryRequest
} from '@transcribator/shared';
import {
  buildObsidianMarkdown,
  OBSIDIAN_DIR,
  type ObsidianScreenshot,
  type ObsidianSourceType
} from './obsidianNotes.js';
import { createHttpError } from './errors.js';

const ROOT_DIR = path.resolve(process.cwd(), '../..');
const DEFAULT_HISTORY_PATH = path.join(ROOT_DIR, 'runtime', 'output', 'history.json');
const DEFAULT_SCREENSHOT_INTERVAL_SECONDS = 30;

export interface HistoryDetailsServiceOptions {
  historyPath?: string | undefined;
  obsidianRoot?: string | undefined;
}

export interface HistoryDetailsService {
  get(id: string): Promise<HistoryDetailResponse>;
  update(id: string, request: UpdateHistoryEntryRequest): Promise<HistoryDetailResponse>;
  trashScreenshots(id: string, request: HistoryScreenshotsRequest): Promise<HistoryScreenshotsOperationResponse>;
  restoreScreenshots(id: string, request: HistoryScreenshotsRequest): Promise<HistoryScreenshotsOperationResponse>;
  clearScreenshotsTrash(id: string): Promise<HistoryScreenshotsOperationResponse>;
  getScreenshotPath(id: string, scope: HistoryScreenshotScope, fileName: string): Promise<string>;
}

interface ObsidianMetadata {
  title?: unknown;
  source?: unknown;
  sourceType?: unknown;
  engine?: unknown;
  createdAt?: unknown;
  videoHash?: unknown;
  screenshotsEnabled?: unknown;
  screenshotIntervalSeconds?: unknown;
  screenshotsCount?: unknown;
  screenshots?: unknown;
  trashedScreenshots?: unknown;
  summary?: unknown;
  cleanText?: unknown;
  rawText?: unknown;
  aiSelection?: unknown;
  [key: string]: unknown;
}

interface HistoryAndIndex {
  history: HistoryEntry[];
  entry: HistoryEntry;
  index: number;
}

interface ObsidianState {
  folderPath: string;
  metadataPath: string;
  markdownPath: string;
  metadata: ObsidianMetadata;
  screenshots: ObsidianScreenshot[];
  trashedScreenshots: ObsidianScreenshot[];
}

export const historyDetailsService = createHistoryDetailsService();

export function createHistoryDetailsService(options: HistoryDetailsServiceOptions = {}): HistoryDetailsService {
  const historyPath = path.resolve(options.historyPath || DEFAULT_HISTORY_PATH);
  const obsidianRoot = path.resolve(options.obsidianRoot || OBSIDIAN_DIR);

  async function get(id: string): Promise<HistoryDetailResponse> {
    const { entry } = await findHistoryEntry(id);
    return buildDetail(entry);
  }

  async function update(id: string, request: UpdateHistoryEntryRequest): Promise<HistoryDetailResponse> {
    const patch = updateHistoryEntryRequestSchema.parse(request);
    const { history, entry, index } = await findHistoryEntry(id);
    let nextEntry = historyEntrySchema.parse({
      ...entry,
      ...patch
    });

    const state = await loadObsidianState(nextEntry, { requireFolder: false });
    if (state) {
      nextEntry = historyEntrySchema.parse({
        ...nextEntry,
        markdownPath: nextEntry.markdownPath || state.markdownPath,
        obsidianFolderPath: state.folderPath,
        screenshotsCount: state.screenshots.length
      });
      await writeObsidianArtifacts(nextEntry, state);
    }

    history[index] = nextEntry;
    await writeHistory(history);
    return buildDetail(nextEntry);
  }

  async function trashScreenshots(
    id: string,
    request: HistoryScreenshotsRequest
  ): Promise<HistoryScreenshotsOperationResponse> {
    const payload = parseScreenshotsRequest(request);
    return moveScreenshots(id, payload.fileNames, 'active', 'trash');
  }

  async function restoreScreenshots(
    id: string,
    request: HistoryScreenshotsRequest
  ): Promise<HistoryScreenshotsOperationResponse> {
    const payload = parseScreenshotsRequest(request);
    return moveScreenshots(id, payload.fileNames, 'trash', 'active');
  }

  async function clearScreenshotsTrash(id: string): Promise<HistoryScreenshotsOperationResponse> {
    const { history, entry, index } = await findHistoryEntry(id);
    const state = await loadObsidianState(entry, { requireFolder: true });
    if (!state) {
      throw createHttpError(404, 'Obsidian folder is not available for this history entry.');
    }
    const deleted: string[] = [];
    const missing: string[] = [];

    for (const screenshot of state.trashedScreenshots) {
      const filePath = screenshotPath(state.folderPath, 'trash', screenshot.fileName);
      if (await exists(filePath)) {
        await rm(filePath, { force: true });
        deleted.push(screenshot.fileName);
      } else {
        missing.push(screenshot.fileName);
      }
    }

    const nextState = {
      ...state,
      trashedScreenshots: []
    };
    const nextEntry = historyEntrySchema.parse({
      ...entry,
      screenshotsCount: nextState.screenshots.length
    });

    history[index] = nextEntry;
    await writeHistory(history);
    await writeObsidianArtifacts(nextEntry, nextState);

    return historyScreenshotsOperationResponseSchema.parse({
      ...(await buildDetail(nextEntry)),
      moved: [],
      missing,
      deleted
    });
  }

  async function getScreenshotPath(id: string, scope: HistoryScreenshotScope, fileName: string): Promise<string> {
    const safeFileName = parseScreenshotFileName(fileName);
    const { entry } = await findHistoryEntry(id);
    const state = await loadObsidianState(entry, { requireFolder: true });
    if (!state) {
      throw createHttpError(404, 'Obsidian folder is not available for this history entry.');
    }
    const filePath = screenshotPath(state.folderPath, scope, safeFileName);

    if (!isPathInside(filePath, screenshotDir(state.folderPath, scope))) {
      throw createHttpError(400, 'Invalid screenshot file name.');
    }

    if (!(await exists(filePath))) {
      throw createHttpError(404, 'Screenshot file not found.');
    }

    return filePath;
  }

  async function moveScreenshots(
    id: string,
    fileNames: string[],
    fromScope: HistoryScreenshotScope,
    toScope: HistoryScreenshotScope
  ): Promise<HistoryScreenshotsOperationResponse> {
    const { history, entry, index } = await findHistoryEntry(id);
    const state = await loadObsidianState(entry, { requireFolder: true });
    if (!state) {
      throw createHttpError(404, 'Obsidian folder is not available for this history entry.');
    }
    const fromMap = new Map((fromScope === 'active' ? state.screenshots : state.trashedScreenshots).map((item) => [item.fileName, item]));
    const toMap = new Map((toScope === 'active' ? state.screenshots : state.trashedScreenshots).map((item) => [item.fileName, item]));
    const moved: string[] = [];
    const missing: string[] = [];

    await mkdir(screenshotDir(state.folderPath, toScope), { recursive: true });

    for (const fileName of fileNames) {
      const screenshot = fromMap.get(fileName) || {
        fileName,
        timestampSeconds: inferTimestampSeconds(fileName)
      };
      const fromPath = screenshotPath(state.folderPath, fromScope, fileName);
      const toPath = screenshotPath(state.folderPath, toScope, fileName);

      fromMap.delete(fileName);
      toMap.set(fileName, screenshot);

      if (await exists(fromPath)) {
        await rm(toPath, { force: true });
        await rename(fromPath, toPath);
        moved.push(fileName);
      } else {
        missing.push(fileName);
      }
    }

    const nextState = {
      ...state,
      screenshots: sortScreenshots(fromScope === 'active' ? [...fromMap.values()] : [...toMap.values()]),
      trashedScreenshots: sortScreenshots(fromScope === 'trash' ? [...fromMap.values()] : [...toMap.values()])
    };
    const nextEntry = historyEntrySchema.parse({
      ...entry,
      screenshotsCount: nextState.screenshots.length
    });

    history[index] = nextEntry;
    await writeHistory(history);
    await writeObsidianArtifacts(nextEntry, nextState);

    return historyScreenshotsOperationResponseSchema.parse({
      ...(await buildDetail(nextEntry)),
      moved,
      missing,
      deleted: []
    });
  }

  async function findHistoryEntry(id: string): Promise<HistoryAndIndex> {
    const history = await readHistory();
    const index = history.findIndex((item) => item.id === id);

    if (index < 0) {
      throw createHttpError(404, 'History entry not found.');
    }

    const entry = history[index];
    if (!entry) {
      throw createHttpError(404, 'History entry not found.');
    }

    return { history, entry, index };
  }

  async function readHistory(): Promise<HistoryEntry[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(historyPath, 'utf8'));
      const result = historyEntrySchema.array().safeParse(parsed);
      return result.success ? result.data : [];
    } catch {
      return [];
    }
  }

  async function writeHistory(history: HistoryEntry[]): Promise<void> {
    await mkdir(path.dirname(historyPath), { recursive: true });
    await writeFile(historyPath, JSON.stringify(history.map((entry) => historyEntrySchema.parse(entry)), null, 2), 'utf8');
  }

  async function buildDetail(entry: HistoryEntry): Promise<HistoryDetailResponse> {
    const state = await loadObsidianState(entry, { requireFolder: false });

    if (!state) {
      return historyDetailResponseSchema.parse({
        entry,
        screenshots: [],
        trashedScreenshots: [],
        metadataPath: ''
      });
    }

    return historyDetailResponseSchema.parse({
      entry: historyEntrySchema.parse({
        ...entry,
        screenshotsCount: state.screenshots.length
      }),
      screenshots: await buildScreenshotDetails(entry.id, state.folderPath, 'active', state.screenshots),
      trashedScreenshots: await buildScreenshotDetails(entry.id, state.folderPath, 'trash', state.trashedScreenshots),
      metadataPath: state.metadataPath
    });
  }

  async function loadObsidianState(
    entry: HistoryEntry,
    options: { requireFolder: boolean }
  ): Promise<ObsidianState | null> {
    const folderPath = options.requireFolder
      ? resolveObsidianFolderPath(entry.obsidianFolderPath, true)
      : resolveObsidianFolderPath(entry.obsidianFolderPath, false);
    if (!folderPath) return null;

    const metadataPath = path.join(folderPath, 'metadata.json');
    const markdownPath = path.join(folderPath, 'transcript.md');
    const metadata = await readMetadata(metadataPath);
    const activeFromMetadata = normalizeScreenshots(metadata.screenshots);
    const trashedFromMetadata = normalizeScreenshots(metadata.trashedScreenshots);
    const activeFromDisk = await listScreenshots(screenshotDir(folderPath, 'active'));
    const trashedFromDisk = await listScreenshots(screenshotDir(folderPath, 'trash'));

    return {
      folderPath,
      metadataPath,
      markdownPath,
      metadata,
      screenshots: sortScreenshots(mergeScreenshots(activeFromMetadata, activeFromDisk)),
      trashedScreenshots: sortScreenshots(mergeScreenshots(trashedFromMetadata, trashedFromDisk))
    };
  }

  function resolveObsidianFolderPath(value: string | undefined, requireFolder: true): string;
  function resolveObsidianFolderPath(value: string | undefined, requireFolder: false): string | null;
  function resolveObsidianFolderPath(value: string | undefined, requireFolder: boolean): string | null {
    const raw = String(value || '').trim();

    if (!raw) {
      if (requireFolder) throw createHttpError(404, 'Obsidian folder is not available for this history entry.');
      return null;
    }

    const resolved = path.resolve(raw);
    if (!isPathInside(resolved, obsidianRoot)) {
      throw createHttpError(400, 'Obsidian folder path is outside the configured runtime directory.');
    }

    return resolved;
  }

  return {
    get,
    update,
    trashScreenshots,
    restoreScreenshots,
    clearScreenshotsTrash,
    getScreenshotPath
  };
}

async function writeObsidianArtifacts(entry: HistoryEntry, state: ObsidianState): Promise<void> {
  await mkdir(state.folderPath, { recursive: true });
  await mkdir(screenshotDir(state.folderPath, 'active'), { recursive: true });
  await mkdir(screenshotDir(state.folderPath, 'trash'), { recursive: true });

  const sourceType = normalizeSourceType(entry.sourceType || state.metadata.sourceType);
  const source = stringValue(entry.source) || stringValue(state.metadata.source);
  const title = stringValue(entry.title) || stringValue(state.metadata.title) || source || 'Transcribator transcript';
  const engine = stringValue(entry.engine) || stringValue(state.metadata.engine);
  const createdAt = stringValue(state.metadata.createdAt) || new Date(entry.startedAt).toISOString();
  const videoHash = stringValue(state.metadata.videoHash) || path.basename(state.folderPath);
  const screenshotIntervalSeconds = positiveInteger(state.metadata.screenshotIntervalSeconds)
    || state.screenshots.find((item) => item.timestampSeconds > 0)?.timestampSeconds
    || DEFAULT_SCREENSHOT_INTERVAL_SECONDS;
  const summary = stringValue(entry.summary) || stringValue(state.metadata.summary);
  const cleanText = stringValue(entry.cleanText) || stringValue(state.metadata.cleanText);
  const rawText = stringValue(entry.rawText) || stringValue(state.metadata.rawText);
  const metadata: ObsidianMetadata = {
    ...state.metadata,
    title,
    source,
    sourceType,
    engine,
    createdAt,
    videoHash,
    screenshotsEnabled: Boolean(state.metadata.screenshotsEnabled || state.screenshots.length > 0 || state.trashedScreenshots.length > 0),
    screenshotIntervalSeconds,
    screenshotsCount: state.screenshots.length,
    screenshots: state.screenshots,
    trashedScreenshots: state.trashedScreenshots,
    summary,
    cleanText,
    rawText,
    aiSelection: state.metadata.aiSelection || {
      enabled: false,
      selectedScreenshotIds: []
    }
  };

  await writeFile(state.metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  await writeFile(state.markdownPath, buildObsidianMarkdown({
    title,
    summary,
    cleanText,
    rawText,
    source,
    sourceType,
    engine,
    createdAt,
    videoHash,
    screenshotsEnabled: Boolean(metadata.screenshotsEnabled),
    screenshotIntervalSeconds,
    screenshots: state.screenshots
  }), 'utf8');
}

async function readMetadata(metadataPath: string): Promise<ObsidianMetadata> {
  try {
    const parsed: unknown = JSON.parse(await readFile(metadataPath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as ObsidianMetadata
      : {};
  } catch {
    return {};
  }
}

async function buildScreenshotDetails(
  historyId: string,
  folderPath: string,
  scope: HistoryScreenshotScope,
  screenshots: ObsidianScreenshot[]
): Promise<HistoryScreenshot[]> {
  return Promise.all(screenshots.map(async (screenshot) => {
    const filePath = screenshotPath(folderPath, scope, screenshot.fileName);
    const fileExists = await exists(filePath);

    return {
      fileName: screenshot.fileName,
      timestampSeconds: screenshot.timestampSeconds,
      exists: fileExists,
      url: fileExists
        ? `/transcribe/history/${encodeURIComponent(historyId)}/screenshots/${scope}/${encodeURIComponent(screenshot.fileName)}`
        : ''
    };
  }));
}

async function listScreenshots(dir: string): Promise<ObsidianScreenshot[]> {
  try {
    const names = await readdir(dir);
    return names
      .filter((name) => screenshotFileNameSchema.safeParse(name).success)
      .map((fileName) => ({
        fileName,
        timestampSeconds: inferTimestampSeconds(fileName)
      }));
  } catch {
    return [];
  }
}

function normalizeScreenshots(value: unknown): ObsidianScreenshot[] {
  if (!Array.isArray(value)) return [];

  const screenshots: ObsidianScreenshot[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const fileName = (item as { fileName?: unknown }).fileName;
    const parsedName = typeof fileName === 'string' ? screenshotFileNameSchema.safeParse(fileName) : null;
    if (!parsedName?.success) continue;

    const timestampSeconds = (item as { timestampSeconds?: unknown }).timestampSeconds;
    screenshots.push({
      fileName: parsedName.data,
      timestampSeconds: nonnegativeNumber(timestampSeconds) ?? inferTimestampSeconds(parsedName.data)
    });
  }

  return screenshots;
}

function mergeScreenshots(...groups: ObsidianScreenshot[][]): ObsidianScreenshot[] {
  const merged = new Map<string, ObsidianScreenshot>();

  for (const group of groups) {
    for (const screenshot of group) {
      if (!merged.has(screenshot.fileName)) {
        merged.set(screenshot.fileName, screenshot);
      }
    }
  }

  return [...merged.values()];
}

function sortScreenshots(screenshots: ObsidianScreenshot[]): ObsidianScreenshot[] {
  return [...screenshots].sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function parseScreenshotsRequest(request: HistoryScreenshotsRequest): HistoryScreenshotsRequest {
  const parsed = historyScreenshotsRequestSchema.safeParse(request);

  if (!parsed.success) {
    throw createHttpError(400, parsed.error.issues[0]?.message || 'Invalid screenshot file name.');
  }

  return parsed.data;
}

function parseScreenshotFileName(fileName: string): string {
  const parsed = screenshotFileNameSchema.safeParse(fileName);

  if (!parsed.success) {
    throw createHttpError(400, parsed.error.issues[0]?.message || 'Invalid screenshot file name.');
  }

  return parsed.data;
}

function screenshotDir(folderPath: string, scope: HistoryScreenshotScope): string {
  return scope === 'active'
    ? path.join(folderPath, 'screenshots')
    : path.join(folderPath, 'trash', 'screenshots');
}

function screenshotPath(folderPath: string, scope: HistoryScreenshotScope, fileName: string): string {
  return path.join(screenshotDir(folderPath, scope), parseScreenshotFileName(fileName));
}

function inferTimestampSeconds(fileName: string): number {
  const match = /^(\d+)-(?<hours>\d{2})-(?<minutes>\d{2})-(?<seconds>\d{2})\.jpg$/i.exec(fileName);
  if (!match?.groups) return 0;

  const hours = Number(match.groups.hours);
  const minutes = Number(match.groups.minutes);
  const seconds = Number(match.groups.seconds);
  if (![hours, minutes, seconds].every(Number.isFinite)) return 0;

  return hours * 3600 + minutes * 60 + seconds;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isPathInside(filePath: string, rootPath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(filePath));
  return relative === '' || Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeSourceType(value: unknown): ObsidianSourceType {
  return value === 'url' ? 'url' : 'file';
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function nonnegativeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
