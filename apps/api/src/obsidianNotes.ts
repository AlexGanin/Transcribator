import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHttpError } from './errors.js';
import type { ProgressHandler } from './types.js';

const ROOT_DIR = path.resolve(process.cwd(), '../..');
const RUNTIME_DIR = path.join(ROOT_DIR, 'runtime');
const TMP_DIR = path.join(RUNTIME_DIR, 'tmp');
export const OBSIDIAN_DIR = path.join(RUNTIME_DIR, 'obsidian');
const DEFAULT_SCREENSHOT_INTERVAL_SECONDS = 30;

export type ObsidianSourceType = 'url' | 'file';

export interface ObsidianScreenshot {
  fileName: string;
  timestampSeconds: number;
}

export interface ObsidianMarkdownInput {
  title: string;
  summary: string;
  cleanText: string;
  rawText: string;
  source: string;
  sourceType: ObsidianSourceType;
  engine: string;
  createdAt: string;
  videoHash: string;
  screenshotsEnabled: boolean;
  screenshotIntervalSeconds: number;
  screenshots: ObsidianScreenshot[];
}

export interface CreateObsidianVaultOptions extends ObsidianMarkdownInput {
  sourcePath?: string | undefined;
  sourceUrl?: string | undefined;
  onProgress?: ProgressHandler | undefined;
}

export interface ObsidianVaultResult {
  markdownPath: string;
  obsidianFolderPath: string;
  screenshotsCount: number;
}

export async function ensureObsidianDir(): Promise<void> {
  await mkdir(OBSIDIAN_DIR, { recursive: true });
}

export function hashStringMd5(value: string): string {
  return createHash('md5').update(value).digest('hex');
}

export async function hashFileMd5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5');
    const input = createReadStream(filePath);

    input.on('data', (chunk) => hash.update(chunk));
    input.once('error', reject);
    input.once('end', () => resolve(hash.digest('hex')));
  });
}

export function normalizeScreenshotIntervalSeconds(value: number | undefined): number {
  return Number.isFinite(value) && value && value > 0
    ? Math.floor(value)
    : DEFAULT_SCREENSHOT_INTERVAL_SECONDS;
}

export function formatScreenshotFileName(index: number, timestampSeconds: number): string {
  return `${String(index).padStart(4, '0')}-${formatTimestampForFile(timestampSeconds)}.jpg`;
}

export function buildObsidianMarkdown(input: ObsidianMarkdownInput): string {
  const screenshots = input.screenshots.length > 0
    ? input.screenshots
      .map((screenshot) => [
        `![[screenshots/${screenshot.fileName}]]`,
        '',
        `\`${formatTimestamp(screenshot.timestampSeconds)}\``
      ].join('\n'))
      .join('\n\n')
    : 'Скриншоты не созданы.';

  return [
    `# ${input.title || input.source || 'Transcribator transcript'}`,
    '',
    '## Краткое содержание',
    '',
    formatSummaryMarkdown(input.summary, input.cleanText),
    '',
    '## Метаданные',
    '',
    `- Source: \`${input.source}\``,
    `- Source type: \`${input.sourceType}\``,
    `- Engine: \`${input.engine}\``,
    `- Created at: \`${input.createdAt}\``,
    `- Video hash: \`${input.videoHash}\``,
    `- Screenshots enabled: \`${String(input.screenshotsEnabled)}\``,
    `- Screenshot interval: \`${input.screenshotIntervalSeconds} seconds\``,
    '',
    '## Скриншоты',
    '',
    screenshots,
    '',
    '## Транскрипция',
    '',
    formatFinalTranscriptMarkdown(input.cleanText),
    ''
  ].join('\n');
}

export async function createObsidianVault(options: CreateObsidianVaultOptions): Promise<ObsidianVaultResult> {
  if (!options.screenshotsEnabled) {
    throw createHttpError(400, 'Obsidian vault creation requires screenshotsEnabled=true.');
  }

  await ensureObsidianDir();
  const obsidianFolderPath = path.join(OBSIDIAN_DIR, options.videoHash);
  const screenshotsDir = path.join(obsidianFolderPath, 'screenshots');
  const markdownPath = path.join(obsidianFolderPath, 'transcript.md');
  const metadataPath = path.join(obsidianFolderPath, 'metadata.json');
  const intervalSeconds = normalizeScreenshotIntervalSeconds(options.screenshotIntervalSeconds);

  await mkdir(screenshotsDir, { recursive: true });
  emitProgress(options, 'screenshots', 5, 'Готовлю папку Obsidian');
  const screenshots = await extractScreenshots({
    ...options,
    screenshotIntervalSeconds: intervalSeconds,
    screenshotsDir
  });
  emitProgress(options, 'obsidian', 30, 'Создаю Markdown для Obsidian');

  const markdownInput = {
    ...options,
    screenshotIntervalSeconds: intervalSeconds,
    screenshots
  };
  await writeFile(markdownPath, buildObsidianMarkdown(markdownInput), 'utf8');
  await writeFile(metadataPath, JSON.stringify(buildMetadata(markdownInput), null, 2), 'utf8');
  emitProgress(options, 'obsidian', 100, 'Obsidian заметка создана');

  return {
    markdownPath,
    obsidianFolderPath,
    screenshotsCount: screenshots.length
  };
}

interface ExtractScreenshotsOptions extends CreateObsidianVaultOptions {
  screenshotsDir: string;
}

async function extractScreenshots(options: ExtractScreenshotsOptions): Promise<ObsidianScreenshot[]> {
  const tempDir = path.join(TMP_DIR, `obsidian-${options.videoHash}-${Date.now()}`);
  const tempPattern = path.join(tempDir, 'frame-%04d.jpg');
  await mkdir(tempDir, { recursive: true });
  emitProgress(options, 'screenshots', 10, 'Извлекаю скриншоты из видео');

  try {
    if (options.sourceType === 'url') {
      if (!options.sourceUrl) {
        throw createHttpError(400, 'Source URL is required for URL screenshots.');
      }
      await runUrlScreenshots(options.sourceUrl, tempPattern, options);
    } else {
      if (!options.sourcePath) {
        throw createHttpError(400, 'Source file path is required for file screenshots.');
      }
      await runFileScreenshots(options.sourcePath, tempPattern, options);
    }

    const screenshots = await moveGeneratedScreenshots(tempDir, options.screenshotsDir, options.screenshotIntervalSeconds);
    emitProgress(options, 'screenshots', 100, 'Скриншоты сохранены');
    return screenshots;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runFileScreenshots(sourcePath: string, outputPattern: string, options: ExtractScreenshotsOptions): Promise<void> {
  return runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'warning',
    '-i',
    sourcePath,
    '-ss',
    String(options.screenshotIntervalSeconds),
    '-vf',
    `fps=1/${options.screenshotIntervalSeconds}`,
    '-q:v',
    '2',
    outputPattern
  ], 'Не удалось извлечь скриншоты из загруженного файла.');
}

async function runUrlScreenshots(sourceUrl: string, outputPattern: string, options: ExtractScreenshotsOptions): Promise<void> {
  const ytdlp = spawn(getYtDlpCommand(), ['-f', 'best[ext=mp4]/best', '-o', '-', sourceUrl], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: buildChildEnv()
  });
  const ffmpeg = spawn(getFfmpegCommand(), [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-i',
    'pipe:0',
    '-ss',
    String(options.screenshotIntervalSeconds),
    '-vf',
    `fps=1/${options.screenshotIntervalSeconds}`,
    '-q:v',
    '2',
    outputPattern
  ], {
    stdio: ['pipe', 'ignore', 'pipe'],
    env: buildChildEnv()
  });
  const stderr: string[] = [];

  ytdlp.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
  ffmpeg.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
  ytdlp.stdout.pipe(ffmpeg.stdin);

  const [ytdlpResult, ffmpegResult] = await Promise.all([
    waitForProcess(ytdlp, 'yt-dlp'),
    waitForProcess(ffmpeg, 'ffmpeg')
  ]);

  if (ytdlpResult !== 0 || ffmpegResult !== 0) {
    throw createHttpError(500, `Не удалось извлечь скриншоты из URL.${formatStderr(stderr)}`);
  }
}

function runFfmpeg(args: string[], errorMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(getFfmpegCommand(), args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: buildChildEnv()
    });
    const stderr: string[] = [];

    child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
    child.once('error', (error) => reject(createHttpError(500, `${errorMessage} ${error.message}`)));
    child.once('close', (code) => {
      if (code !== 0) {
        reject(createHttpError(500, `${errorMessage}${formatStderr(stderr)}`));
        return;
      }
      resolve();
    });
  });
}

async function moveGeneratedScreenshots(
  tempDir: string,
  screenshotsDir: string,
  intervalSeconds: number
): Promise<ObsidianScreenshot[]> {
  const names = (await readdir(tempDir))
    .filter((name) => name.endsWith('.jpg'))
    .sort((a, b) => a.localeCompare(b));
  const screenshots: ObsidianScreenshot[] = [];

  for (const [index, name] of names.entries()) {
    const screenshotIndex = index + 1;
    const timestampSeconds = screenshotIndex * intervalSeconds;
    const fileName = formatScreenshotFileName(screenshotIndex, timestampSeconds);
    await rename(path.join(tempDir, name), path.join(screenshotsDir, fileName));
    screenshots.push({ fileName, timestampSeconds });
  }

  return screenshots;
}

function buildMetadata(input: ObsidianMarkdownInput) {
  return {
    source: input.source,
    sourceType: input.sourceType,
    engine: input.engine,
    createdAt: input.createdAt,
    videoHash: input.videoHash,
    screenshotsEnabled: input.screenshotsEnabled,
    screenshotIntervalSeconds: input.screenshotIntervalSeconds,
    screenshotsCount: input.screenshots.length,
    screenshots: input.screenshots,
    aiSelection: {
      enabled: false,
      selectedScreenshotIds: []
    }
  };
}

async function waitForProcess(child: ReturnType<typeof spawn>, label: string): Promise<number | null> {
  const result = await new Promise<{ code?: number | null | undefined; error?: Error | undefined }>((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('close', (code) => resolve({ code }));
  });

  if (result.error) {
    throw createHttpError(500, `Не удалось запустить ${label}: ${result.error.message}`);
  }

  if (result.code !== 0) {
    child.kill('SIGTERM');
  }

  return typeof result.code === 'number' ? result.code : null;
}

function emitProgress(options: { onProgress?: ProgressHandler | undefined }, stage: string, progress: number, message: string): void {
  options.onProgress?.({
    stage,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    message
  });
}

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function formatTimestampForFile(totalSeconds: number): string {
  return formatTimestamp(totalSeconds).replaceAll(':', '-');
}

function formatFinalTranscriptMarkdown(text: string): string {
  const normalized = normalizeMarkdownText(text);

  if (!normalized) {
    return 'Нет финального текста.';
  }

  return normalized
    .split(/\n{2,}/)
    .flatMap(formatTranscriptBlock)
    .join('\n\n');
}

function formatSummaryMarkdown(summary: string, cleanText: string): string {
  const normalized = normalizeMarkdownText(summary);

  if (!normalized) {
    return 'Краткое содержание пока не сформировано.';
  }

  if (isDuplicatedSummary(normalized, cleanText)) {
    return [
      'Краткое содержание не сформировано отдельно: транскрипция пришла почти без пунктуации,',
      'поэтому основной текст ниже разбит на читаемые Markdown-абзацы.'
    ].join(' ');
  }

  return formatFinalTranscriptMarkdown(normalized);
}

function normalizeMarkdownText(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

  if (sentences.length <= 1 && text.length > 300) {
    return formatPunctuationPoorTranscript(text);
  }

  if (sentences.length <= 3) {
    return [sentences.join(' ')];
  }

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(' '));
  }

  return paragraphs;
}

function formatPunctuationPoorTranscript(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length <= 55) {
    return [formatParagraph(words.join(' '))];
  }

  const paragraphs: string[] = [];
  let start = 0;

  while (start < words.length) {
    const remaining = words.length - start;

    if (remaining <= 55) {
      paragraphs.push(formatParagraph(words.slice(start).join(' ')));
      break;
    }

    const end = chooseParagraphEnd(words, start);
    paragraphs.push(formatParagraph(words.slice(start, end).join(' ')));
    start = end;
  }

  return paragraphs;
}

function chooseParagraphEnd(words: string[], start: number): number {
  const minEnd = Math.min(words.length, start + 30);
  const targetEnd = Math.min(words.length, start + 45);
  const maxEnd = Math.min(words.length, start + 65);
  const preferredBreak = findBreakMarker(words, targetEnd, maxEnd);

  if (preferredBreak !== null) {
    return avoidDanglingParagraphEnd(words, minEnd, preferredBreak);
  }

  const fallbackBreak = findBreakMarker(words, minEnd, maxEnd);

  if (fallbackBreak !== null) {
    return avoidDanglingParagraphEnd(words, minEnd, fallbackBreak);
  }

  return avoidDanglingParagraphEnd(words, minEnd, maxEnd);
}

function findBreakMarker(words: string[], from: number, to: number): number | null {
  for (let index = from; index < to; index += 1) {
    if (isParagraphMarker(words, index)) {
      return index;
    }
  }

  return null;
}

function isParagraphMarker(words: string[], index: number): boolean {
  const one = normalizeWord(words[index]);
  const two = `${one} ${normalizeWord(words[index + 1])}`.trim();
  const three = `${two} ${normalizeWord(words[index + 2])}`.trim();

  return [
    'первое',
    'второе',
    'третье',
    'второй',
    'третий',
    'теперь',
    'далее',
    'затем',
    'также',
    'кроме того',
    'при этом',
    'по дизайну',
    'по клавиатуре',
    'по портам',
    'по характеристикам',
    'самый интересный',
    'еще хотелось',
    'если обсуждать',
    'ну и',
    'в итоге',
    'в результате',
    'для работы',
    'а для'
  ].some((marker) => marker === one || marker === two || marker === three);
}

function normalizeWord(word: string | undefined): string {
  return String(word || '')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function avoidDanglingParagraphEnd(words: string[], minEnd: number, end: number): number {
  let nextEnd = end;

  while (nextEnd > minEnd && isDanglingEndWord(words[nextEnd - 1])) {
    nextEnd -= 1;
  }

  return nextEnd;
}

function isDanglingEndWord(word: string | undefined): boolean {
  return [
    'а',
    'в',
    'для',
    'и',
    'как',
    'к',
    'на',
    'но',
    'по',
    'с',
    'то',
    'что'
  ].includes(normalizeWord(word));
}

function formatParagraph(text: string): string {
  const trimmed = text.trim().replace(/^и\s+/iu, '');

  if (!trimmed) {
    return '';
  }

  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?…]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function isDuplicatedSummary(summary: string, cleanText: string): boolean {
  const normalizedSummary = compactForComparison(summary.replace(/^[-*]\s+/gm, ''));
  const normalizedCleanText = compactForComparison(cleanText);

  if (normalizedSummary.length < 300 || normalizedCleanText.length < 300) {
    return false;
  }

  const sampleLength = Math.min(500, normalizedSummary.length, normalizedCleanText.length);
  const summaryStart = normalizedSummary.slice(0, sampleLength);
  const cleanStart = normalizedCleanText.slice(0, sampleLength);

  return normalizedCleanText.includes(summaryStart) || normalizedSummary.includes(cleanStart);
}

function compactForComparison(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function getYtDlpCommand(): string {
  return process.env.YTDLP_COMMAND || 'yt-dlp';
}

function getFfmpegCommand(): string {
  return process.env.FFMPEG_COMMAND || 'ffmpeg';
}

function buildChildEnv(): NodeJS.ProcessEnv {
  const pathParts = [
    path.dirname(getYtDlpCommand()),
    path.dirname(getFfmpegCommand()),
    process.env.PATH || ''
  ].filter(Boolean);

  return {
    ...process.env,
    PATH: [...new Set(pathParts)].join(path.delimiter)
  };
}

function formatStderr(stderrLines: string[]): string {
  const tail = stderrLines.join('').trim().split(/\r?\n/).slice(-8).join('\n').trim();
  return tail ? `\n${tail}` : '';
}
