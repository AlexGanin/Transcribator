import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { HistoryDetailResponse, HistoryScreenshot } from '@transcribator/shared';
import { createHttpError } from './errors.js';
import { DEFAULT_RUNTIME_DIR, type ScreenshotRecord, type TranscriptionStore } from './transcriptionStore.js';

export interface GenerateTranscriptionMarkdownOptions {
  store: TranscriptionStore;
  transcriptionId: string;
  runtimeDir?: string | undefined;
}

export async function generateTranscriptionMarkdown(
  options: GenerateTranscriptionMarkdownOptions
): Promise<HistoryDetailResponse> {
  const runtimeDir = options.runtimeDir || DEFAULT_RUNTIME_DIR;
  const record = options.store.getTranscription(options.transcriptionId);
  if (!record) {
    throw createHttpError(404, 'Transcription history entry not found.');
  }

  const activeScreenshots = options.store.listScreenshots(record.id, 'active');
  const artifactDir = path.join(runtimeDir, 'artifacts', record.id);
  const markdownPath = path.join(artifactDir, 'transcript.md');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(markdownPath, buildTranscriptionMarkdown({
    title: record.title || record.source || record.id,
    source: record.source,
    sourceType: record.sourceType,
    engine: record.engine,
    createdAt: new Date(record.createdAt).toISOString(),
    summary: record.summary,
    text: bestTranscriptText(record),
    screenshots: activeScreenshots
  }), 'utf8');

  const updated = options.store.patchTranscription(record.id, { markdownPath });
  return {
    entry: options.store.toHistoryEntry(updated),
    screenshots: await toHistoryScreenshots(record.id, activeScreenshots, 'active'),
    trashedScreenshots: await toHistoryScreenshots(record.id, options.store.listScreenshots(record.id, 'trash'), 'trash'),
    metadataPath: ''
  };
}

export interface BuildTranscriptionMarkdownInput {
  title: string;
  source: string;
  sourceType: string;
  engine: string;
  createdAt: string;
  summary: string;
  text: string;
  screenshots: ScreenshotRecord[];
}

export function buildTranscriptionMarkdown(input: BuildTranscriptionMarkdownInput): string {
  const sections = [
    `# ${input.title || 'Transcribator transcript'}`,
    '',
    '## Метаданные',
    '',
    `- Source: \`${input.source || 'unknown'}\``,
    `- Source type: \`${input.sourceType || 'unknown'}\``,
    `- Engine: \`${input.engine || 'unknown'}\``,
    `- Created at: \`${input.createdAt}\``
  ];

  const summary = normalizeMarkdownText(input.summary);
  if (summary) {
    sections.push('', '## Краткое содержание', '', formatTranscriptMarkdown(summary));
  }

  sections.push('', '## Скриншоты', '', formatScreenshotsMarkdown(input.screenshots));
  sections.push('', '## Транскрипция', '', formatTranscriptMarkdown(input.text), '');
  return sections.join('\n');
}

function bestTranscriptText(record: {
  formattedText: string;
  cleanText: string;
  rawText: string;
}): string {
  return record.formattedText || record.cleanText || record.rawText || '';
}

function formatScreenshotsMarkdown(screenshots: ScreenshotRecord[]): string {
  if (screenshots.length === 0) {
    return 'Скриншоты не созданы.';
  }

  return screenshots
    .map((screenshot) => [
      `![[screenshots/${screenshot.fileName}]]`,
      '',
      `\`${formatTimestamp(screenshot.timestampSeconds)}\``
    ].join('\n'))
    .join('\n\n');
}

function formatTranscriptMarkdown(text: string): string {
  const normalized = normalizeMarkdownText(text);
  if (!normalized) {
    return 'Нет текста.';
  }

  return normalized
    .split(/\n{2,}/)
    .flatMap(formatTranscriptBlock)
    .join('\n\n');
}

function formatTranscriptBlock(block: string): string[] {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  if (lines.some((line) => /^#{1,6}\s/.test(line))) {
    return [lines.join('\n')];
  }

  if (lines.every((line) => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line))) {
    return [lines.join('\n')];
  }

  const text = lines.join(' ');
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 3) {
    return [sentences.join(' ')];
  }

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(' '));
  }

  return paragraphs;
}

function normalizeMarkdownText(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

async function toHistoryScreenshots(
  transcriptionId: string,
  screenshots: ScreenshotRecord[],
  scope: 'active' | 'trash'
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
