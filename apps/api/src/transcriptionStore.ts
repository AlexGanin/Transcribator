import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  historyEntrySchema,
  screenshotFileNameSchema,
  type HistoryEntry,
  type HistoryScreenshotScope
} from '@transcribator/shared';

const ROOT_DIR = path.resolve(process.cwd(), '../..');
export const DEFAULT_RUNTIME_DIR = path.join(ROOT_DIR, 'runtime');
export const DEFAULT_DB_PATH = path.join(DEFAULT_RUNTIME_DIR, 'transcribator.sqlite');
export const DEFAULT_HISTORY_PATH = path.join(DEFAULT_RUNTIME_DIR, 'output', 'history.json');

export type TranscriptionStatus = 'running' | 'done' | 'error';
export type ScreenshotStatus = HistoryScreenshotScope;

export interface TranscriptionRecord {
  id: string;
  status: TranscriptionStatus;
  title: string;
  source: string;
  sourceType: string;
  engine: string;
  rawText: string;
  cleanText: string;
  formattedText: string;
  summary: string;
  markdownPath: string;
  error: string;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
}

export interface ScreenshotRecord {
  id: string;
  transcriptionId: string;
  fileName: string;
  timestampSeconds: number;
  status: ScreenshotStatus;
  path: string;
}

export interface UpsertTranscriptionInput {
  id: string;
  status?: TranscriptionStatus | undefined;
  title?: string | undefined;
  source?: string | undefined;
  sourceType?: string | undefined;
  engine?: string | undefined;
  rawText?: string | undefined;
  cleanText?: string | undefined;
  formattedText?: string | undefined;
  summary?: string | undefined;
  markdownPath?: string | undefined;
  error?: string | undefined;
  createdAt?: number | undefined;
  updatedAt?: number | undefined;
  finishedAt?: number | null | undefined;
}

export type PatchTranscriptionInput = Partial<Omit<UpsertTranscriptionInput, 'id' | 'createdAt'>>;

export interface AddScreenshotInput {
  fileName: string;
  timestampSeconds: number;
  path: string;
  status?: ScreenshotStatus | undefined;
}

export interface TranscriptionStoreOptions {
  dbPath?: string | undefined;
  now?: (() => number) | undefined;
}

export interface MigrateHistoryJsonOptions {
  store: TranscriptionStore;
  historyPath?: string | undefined;
}

export class TranscriptionStore {
  readonly dbPath: string;
  private readonly db: DatabaseSync;
  private readonly now: () => number;

  constructor(options: TranscriptionStoreOptions = {}) {
    this.dbPath = options.dbPath || DEFAULT_DB_PATH;
    this.now = options.now || Date.now;
    mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.ensureSchema();
  }

  close(): void {
    this.db.close();
  }

  upsertTranscription(input: UpsertTranscriptionInput): TranscriptionRecord {
    const existing = this.getTranscription(input.id);
    const now = this.now();
    const next: TranscriptionRecord = {
      id: input.id,
      status: input.status || existing?.status || 'running',
      title: coalesceString(input.title, existing?.title),
      source: coalesceString(input.source, existing?.source),
      sourceType: coalesceString(input.sourceType, existing?.sourceType),
      engine: coalesceString(input.engine, existing?.engine),
      rawText: coalesceString(input.rawText, existing?.rawText),
      cleanText: coalesceString(input.cleanText, existing?.cleanText),
      formattedText: coalesceString(input.formattedText, existing?.formattedText),
      summary: coalesceString(input.summary, existing?.summary),
      markdownPath: coalesceString(input.markdownPath, existing?.markdownPath),
      error: coalesceString(input.error, existing?.error),
      createdAt: input.createdAt || existing?.createdAt || now,
      updatedAt: input.updatedAt || now,
      finishedAt: input.finishedAt === undefined ? existing?.finishedAt || null : input.finishedAt
    };

    this.db.prepare(`
      INSERT INTO transcriptions (
        id,
        status,
        title,
        source,
        source_type,
        engine,
        raw_text,
        clean_text,
        formatted_text,
        summary,
        markdown_path,
        error,
        created_at,
        updated_at,
        finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        title = excluded.title,
        source = excluded.source,
        source_type = excluded.source_type,
        engine = excluded.engine,
        raw_text = excluded.raw_text,
        clean_text = excluded.clean_text,
        formatted_text = excluded.formatted_text,
        summary = excluded.summary,
        markdown_path = excluded.markdown_path,
        error = excluded.error,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        finished_at = excluded.finished_at
    `).run(
      next.id,
      next.status,
      next.title,
      next.source,
      next.sourceType,
      next.engine,
      next.rawText,
      next.cleanText,
      next.formattedText,
      next.summary,
      next.markdownPath,
      next.error,
      next.createdAt,
      next.updatedAt,
      next.finishedAt
    );

    return next;
  }

  patchTranscription(id: string, patch: PatchTranscriptionInput): TranscriptionRecord {
    const existing = this.getTranscription(id);
    if (!existing) {
      throw new Error('Transcription not found.');
    }

    return this.upsertTranscription({
      id,
      ...patch,
      createdAt: existing.createdAt,
      updatedAt: this.now()
    });
  }

  deleteTranscription(id: string): TranscriptionRecord | null {
    const existing = this.getTranscription(id);
    if (!existing) return null;

    this.db.prepare('DELETE FROM transcriptions WHERE id = ?').run(id);
    return existing;
  }

  getTranscription(id: string): TranscriptionRecord | null {
    const row = this.db.prepare('SELECT * FROM transcriptions WHERE id = ?').get(id) as TranscriptionRow | undefined;
    return row ? mapTranscriptionRow(row) : null;
  }

  listHistory(limit = 200): HistoryEntry[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM transcriptions
      WHERE status IN ('done', 'error')
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as unknown as TranscriptionRow[];

    return rows.map((row) => this.toHistoryEntry(mapTranscriptionRow(row)));
  }

  toHistoryEntry(record: TranscriptionRecord): HistoryEntry {
    const finishedAt = record.finishedAt || record.updatedAt || record.createdAt;
    const screenshotsCount = this.countScreenshots(record.id, 'active');

    return historyEntrySchema.parse({
      id: record.id,
      status: record.status === 'error' ? 'error' : 'done',
      title: record.title || record.source || '',
      sourceType: record.sourceType || undefined,
      source: record.source || undefined,
      engine: record.engine || undefined,
      startedAt: record.createdAt,
      finishedAt,
      elapsedSeconds: Math.max(0, Math.floor((finishedAt - record.createdAt) / 1000)),
      stages: [],
      outputPath: '',
      markdownPath: record.markdownPath,
      obsidianFolderPath: '',
      screenshotsCount,
      summary: record.summary,
      cleanText: record.cleanText,
      formattedText: record.formattedText,
      rawText: record.rawText,
      error: record.error
    });
  }

  addScreenshots(transcriptionId: string, screenshots: AddScreenshotInput[]): ScreenshotRecord[] {
    const records = screenshots.map((screenshot) => ({
      id: randomUUID(),
      transcriptionId,
      fileName: screenshotFileNameSchema.parse(screenshot.fileName),
      timestampSeconds: Number.isFinite(screenshot.timestampSeconds) ? screenshot.timestampSeconds : 0,
      status: screenshot.status || 'active',
      path: screenshot.path
    }));

    const statement = this.db.prepare(`
      INSERT INTO screenshots (
        id,
        transcription_id,
        file_name,
        timestamp_seconds,
        status,
        path
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(transcription_id, file_name) DO UPDATE SET
        timestamp_seconds = excluded.timestamp_seconds,
        status = excluded.status,
        path = excluded.path
    `);

    for (const record of records) {
      statement.run(
        record.id,
        record.transcriptionId,
        record.fileName,
        record.timestampSeconds,
        record.status,
        record.path
      );
    }

    return this.listScreenshots(transcriptionId);
  }

  listScreenshots(transcriptionId: string, status?: ScreenshotStatus | undefined): ScreenshotRecord[] {
    const rows = status
      ? this.db.prepare(`
        SELECT *
        FROM screenshots
        WHERE transcription_id = ? AND status = ?
        ORDER BY timestamp_seconds ASC, file_name ASC
      `).all(transcriptionId, status) as unknown as ScreenshotRow[]
      : this.db.prepare(`
        SELECT *
        FROM screenshots
        WHERE transcription_id = ?
        ORDER BY timestamp_seconds ASC, file_name ASC
      `).all(transcriptionId) as unknown as ScreenshotRow[];

    return rows.map(mapScreenshotRow);
  }

  getScreenshot(transcriptionId: string, fileName: string): ScreenshotRecord | null {
    const safeName = screenshotFileNameSchema.parse(fileName);
    const row = this.db.prepare(`
      SELECT *
      FROM screenshots
      WHERE transcription_id = ? AND file_name = ?
    `).get(transcriptionId, safeName) as ScreenshotRow | undefined;

    return row ? mapScreenshotRow(row) : null;
  }

  setScreenshotStatus(
    transcriptionId: string,
    fileName: string,
    status: ScreenshotStatus,
    nextPath: string
  ): ScreenshotRecord | null {
    const safeName = screenshotFileNameSchema.parse(fileName);
    const existing = this.getScreenshot(transcriptionId, safeName);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE screenshots
      SET status = ?, path = ?
      WHERE transcription_id = ? AND file_name = ?
    `).run(status, nextPath, transcriptionId, safeName);

    return this.getScreenshot(transcriptionId, safeName);
  }

  deleteTrashScreenshots(transcriptionId: string): ScreenshotRecord[] {
    const trashed = this.listScreenshots(transcriptionId, 'trash');
    this.db.prepare('DELETE FROM screenshots WHERE transcription_id = ? AND status = ?').run(transcriptionId, 'trash');
    return trashed;
  }

  private countScreenshots(transcriptionId: string, status: ScreenshotStatus): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM screenshots
      WHERE transcription_id = ? AND status = ?
    `).get(transcriptionId, status) as { count?: number } | undefined;

    return Number(row?.count) || 0;
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transcriptions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL DEFAULT '',
        engine TEXT NOT NULL DEFAULT '',
        raw_text TEXT NOT NULL DEFAULT '',
        clean_text TEXT NOT NULL DEFAULT '',
        formatted_text TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        markdown_path TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        finished_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS screenshots (
        id TEXT PRIMARY KEY,
        transcription_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        timestamp_seconds REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('active', 'trash')),
        path TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (transcription_id) REFERENCES transcriptions(id) ON DELETE CASCADE,
        UNIQUE (transcription_id, file_name)
      );

      CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at
        ON transcriptions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_screenshots_transcription_status
        ON screenshots(transcription_id, status, timestamp_seconds);
    `);
  }
}

export function createTranscriptionStore(options: TranscriptionStoreOptions = {}): TranscriptionStore {
  return new TranscriptionStore(options);
}

export const defaultTranscriptionStore = createTranscriptionStore();

export async function migrateHistoryJsonToSqlite(options: MigrateHistoryJsonOptions): Promise<void> {
  const historyPath = options.historyPath || DEFAULT_HISTORY_PATH;
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(historyPath, 'utf8'));
  } catch {
    return;
  }

  const entries = historyEntrySchema.array().catch([]).parse(parsed);
  for (const entry of entries.reverse()) {
    if (options.store.getTranscription(entry.id)) {
      continue;
    }

    options.store.upsertTranscription({
      id: entry.id,
      status: entry.status,
      title: entry.title,
      source: entry.source || '',
      sourceType: entry.sourceType || '',
      engine: entry.engine || '',
      rawText: entry.rawText,
      cleanText: entry.cleanText,
      formattedText: entry.formattedText || '',
      summary: entry.summary,
      markdownPath: entry.markdownPath,
      error: entry.error,
      createdAt: entry.startedAt,
      updatedAt: entry.finishedAt || entry.startedAt,
      finishedAt: entry.finishedAt
    });

    await migrateLegacyScreenshots(options.store, entry.id, entry.obsidianFolderPath);
  }
}

async function migrateLegacyScreenshots(
  store: TranscriptionStore,
  transcriptionId: string,
  folderPath: string
): Promise<void> {
  if (!folderPath) return;

  try {
    const metadata = JSON.parse(await readFile(path.join(folderPath, 'metadata.json'), 'utf8')) as {
      screenshots?: Array<{ fileName?: unknown; timestampSeconds?: unknown }> | undefined;
      trashedScreenshots?: Array<{ fileName?: unknown; timestampSeconds?: unknown }> | undefined;
    };
    const active = normalizeLegacyScreenshots(metadata.screenshots, folderPath, 'active');
    const trash = normalizeLegacyScreenshots(metadata.trashedScreenshots, folderPath, 'trash');
    store.addScreenshots(transcriptionId, [...active, ...trash]);
  } catch {
    return;
  }
}

function normalizeLegacyScreenshots(
  screenshots: Array<{ fileName?: unknown; timestampSeconds?: unknown }> | undefined,
  folderPath: string,
  status: ScreenshotStatus
): AddScreenshotInput[] {
  const normalized: AddScreenshotInput[] = [];

  for (const item of screenshots || []) {
    const parsed = screenshotFileNameSchema.safeParse(item.fileName);
    if (!parsed.success) continue;
    normalized.push({
      fileName: parsed.data,
      timestampSeconds: Number(item.timestampSeconds) || 0,
      status,
      path: path.join(
        folderPath,
        status === 'active' ? 'screenshots' : path.join('trash', 'screenshots'),
        parsed.data
      )
    });
  }

  return normalized;
}

interface TranscriptionRow {
  id: string;
  status: string;
  title: string;
  source: string;
  source_type: string;
  engine: string;
  raw_text: string;
  clean_text: string;
  formatted_text: string;
  summary: string;
  markdown_path: string;
  error: string;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
}

interface ScreenshotRow {
  id: string;
  transcription_id: string;
  file_name: string;
  timestamp_seconds: number;
  status: ScreenshotStatus;
  path: string;
}

function mapTranscriptionRow(row: TranscriptionRow): TranscriptionRecord {
  return {
    id: row.id,
    status: row.status === 'error' ? 'error' : row.status === 'done' ? 'done' : 'running',
    title: row.title || '',
    source: row.source || '',
    sourceType: row.source_type || '',
    engine: row.engine || '',
    rawText: row.raw_text || '',
    cleanText: row.clean_text || '',
    formattedText: row.formatted_text || '',
    summary: row.summary || '',
    markdownPath: row.markdown_path || '',
    error: row.error || '',
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || Number(row.created_at) || 0,
    finishedAt: row.finished_at === null ? null : Number(row.finished_at) || null
  };
}

function mapScreenshotRow(row: ScreenshotRow): ScreenshotRecord {
  return {
    id: row.id,
    transcriptionId: row.transcription_id,
    fileName: row.file_name,
    timestampSeconds: Number(row.timestamp_seconds) || 0,
    status: row.status === 'trash' ? 'trash' : 'active',
    path: row.path || ''
  };
}

function coalesceString(input: string | undefined, fallback: string | undefined): string {
  return input === undefined ? fallback || '' : String(input);
}
