import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { once } from 'node:events';
import OpenAI from 'openai';
import { postProcessTranscript, summarizeTranscript } from './postProcess.js';
import { createHttpError } from './errors.js';
import {
  createObsidianVault,
  ensureObsidianDir,
  hashFileMd5,
  hashStringMd5,
  normalizeScreenshotIntervalSeconds
} from './obsidianNotes.js';
import {
  buildSpeechRanges,
  formatClipTimestamps,
  getTranscriptionVadConfig,
  parseSilencedetectOutput
} from './speechDetection.js';
import { buildWhisperArgs } from './whisperArgs.js';
import type {
  ChildProcessMeta,
  LoggedChildProcess,
  PipelineResult,
  SpawnLoggedOptions,
  TranscriptSegment,
  TranscriptFileParts,
  TranscriptFinalizeMeta,
  TranscriptionOptions
} from './types.js';

const ROOT_DIR = path.resolve(process.cwd(), '../..');
const RUNTIME_DIR = path.join(ROOT_DIR, 'runtime');
const SOURCE_DIR = path.join(RUNTIME_DIR, 'source');
const OUTPUT_DIR = path.join(RUNTIME_DIR, 'output');
const TMP_DIR = path.join(RUNTIME_DIR, 'tmp');
const DEFAULT_TIMEOUT_MS = Number(process.env.TRANSCRIBE_TIMEOUT_MS || 15 * 60 * 1000);
const ENGINE_OPENAI_WHISPER = 'openai-whisper';
const ENGINE_MLX_WHISPER = 'mlx-whisper';
const ENGINE_OPENAI_API = 'openai';
const ENGINE_LOCAL_STDIN = 'local-stdin';

export async function ensureRuntimeDirs(): Promise<void> {
  await Promise.all([
    mkdir(SOURCE_DIR, { recursive: true }),
    mkdir(OUTPUT_DIR, { recursive: true }),
    mkdir(TMP_DIR, { recursive: true }),
    ensureObsidianDir()
  ]);
}

export async function transcribeUrl(inputUrl: string, options: TranscriptionOptions = {}) {
  if (!inputUrl || typeof inputUrl !== 'string') {
    throw createHttpError(400, 'URL is required.');
  }

  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw createHttpError(400, 'Invalid URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createHttpError(400, 'Only http and https URLs are supported.');
  }

  await assertCommandAvailable(getYtDlpCommand());
  await assertCommandAvailable(getFfmpegCommand());

  return transcribeFromUrlStream(inputUrl, options);
}

export async function transcribeFile(file: Express.Multer.File | undefined, options: TranscriptionOptions = {}) {
  if (!file) {
    throw createHttpError(400, 'Audio or video file is required.');
  }

  await assertCommandAvailable(getFfmpegCommand());
  const safeOriginalName = safeFileName(file.originalname || file.filename);
  const savedSourcePath = path.join(SOURCE_DIR, safeOriginalName);
  await rm(savedSourcePath, { force: true });
  await streamPipeline(createReadStream(file.path), createWriteStream(savedSourcePath));
  await rm(file.path, { force: true });

  return transcribeFromFileStream(savedSourcePath, safeOriginalName, options);
}

async function transcribeFromUrlStream(inputUrl: string, options: TranscriptionOptions) {
  const timestamp = timestampForFile();
  const wavPath = path.join(TMP_DIR, `${timestamp}.wav`);
  const outputPath = path.join(OUTPUT_DIR, `${timestamp}.txt`);
  const engine = getTranscriptionEngine(options);

  if (engine === ENGINE_LOCAL_STDIN) {
    await assertCommandAvailable(getWhisperCommand());
    const rawText = await runUrlToWhisperStdin(inputUrl, timestamp, options);
    return finalizeTranscript(rawText, outputPath, {
      source: inputUrl,
      sourceType: 'url',
      engine,
      videoHash: hashStringMd5(inputUrl),
      sourceUrl: inputUrl
    }, options);
  }

  await runUrlToWav(inputUrl, wavPath, options);
  const rawText = await transcribeWavFile(wavPath, timestamp, options);
  await rm(wavPath, { force: true });
  return finalizeTranscript(rawText, outputPath, {
    source: inputUrl,
    sourceType: 'url',
    engine,
    videoHash: hashStringMd5(inputUrl),
    sourceUrl: inputUrl
  }, options);
}

async function transcribeFromFileStream(sourcePath: string, originalName: string, options: TranscriptionOptions) {
  const timestamp = timestampForFile();
  const wavPath = path.join(TMP_DIR, `${timestamp}.wav`);
  const outputPath = path.join(OUTPUT_DIR, `${timestamp}.txt`);
  const engine = getTranscriptionEngine(options);
  const videoHash = options.screenshotsEnabled ? await hashFileMd5(sourcePath) : hashStringMd5(sourcePath);

  if (engine === ENGINE_LOCAL_STDIN) {
    await assertCommandAvailable(getWhisperCommand());
    const rawText = await runFileToWhisperStdin(sourcePath, timestamp, options);
    return finalizeTranscript(rawText, outputPath, {
      source: originalName,
      sourceType: 'file',
      engine,
      videoHash,
      sourcePath
    }, options);
  }

  await runFileToWav(sourcePath, wavPath, options);
  const rawText = await transcribeWavFile(wavPath, timestamp, options);
  await rm(wavPath, { force: true });
  return finalizeTranscript(rawText, outputPath, {
    source: originalName,
    sourceType: 'file',
    engine,
    videoHash,
    sourcePath
  }, options);
}

async function runUrlToWav(inputUrl: string, wavPath: string, options: TranscriptionOptions): Promise<void> {
  emitProgress(options, 'download', 1, 'Downloading audio');
  const ytdlp = spawnLogged(getYtDlpCommand(), ['-f', 'bestaudio', '-o', '-', inputUrl], {
    onStderr: (line) => {
      const percent = parseYtDlpProgress(line);
      if (percent !== null) {
        emitProgress(options, 'download', percent, 'Downloading audio');
      }
    }
  });
  const ffmpeg = spawnLogged(getFfmpegCommand(), [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-i',
    'pipe:0',
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    'wav',
    'pipe:1'
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);
  const writer = createWriteStream(wavPath);
  ffmpeg.stdout.pipe(writer);

  await waitForPipeline([ytdlp, ffmpeg], writer);
  emitProgress(options, 'download', 100, 'Audio downloaded and converted');
}

async function runFileToWav(sourcePath: string, wavPath: string, options: TranscriptionOptions): Promise<void> {
  emitProgress(options, 'convert', 5, 'Converting uploaded file');
  const ffmpeg = spawnLogged(getFfmpegCommand(), [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-i',
    sourcePath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    'wav',
    'pipe:1'
  ]);

  const writer = createWriteStream(wavPath);
  ffmpeg.stdout.pipe(writer);
  await waitForPipeline([ffmpeg], writer);
  emitProgress(options, 'convert', 100, 'File converted');
}

async function runUrlToWhisperStdin(inputUrl: string, timestamp: string, options: TranscriptionOptions): Promise<string> {
  emitProgress(options, 'download', 1, 'Downloading audio');
  const ytdlp = spawnLogged(getYtDlpCommand(), ['-f', 'bestaudio', '-o', '-', inputUrl], {
    onStderr: (line) => {
      const percent = parseYtDlpProgress(line);
      if (percent !== null) {
        emitProgress(options, 'download', percent, 'Downloading audio');
      }
    }
  });
  const ffmpeg = spawnLogged(getFfmpegCommand(), [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-i',
    'pipe:0',
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    'wav',
    'pipe:1'
  ]);
  emitProgress(options, 'transcribe', 5, 'Transcribing audio');
  const whisper = await spawnOpenAIWhisperForInput('-', timestamp);

  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(whisper.stdin);

  const result = await waitForPipeline([ytdlp, ffmpeg, whisper]);
  emitProgress(options, 'download', 100, 'Audio downloaded');
  emitProgress(options, 'transcribe', 100, 'Transcription complete');
  return readWhisperResult(result, timestamp);
}

async function runFileToWhisperStdin(sourcePath: string, timestamp: string, options: TranscriptionOptions): Promise<string> {
  emitProgress(options, 'convert', 5, 'Converting uploaded file');
  const ffmpeg = spawnLogged(getFfmpegCommand(), [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-i',
    sourcePath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    'wav',
    'pipe:1'
  ]);
  emitProgress(options, 'transcribe', 5, 'Transcribing audio');
  const whisper = await spawnOpenAIWhisperForInput('-', timestamp);

  ffmpeg.stdout.pipe(whisper.stdin);

  const result = await waitForPipeline([ffmpeg, whisper]);
  emitProgress(options, 'convert', 100, 'File converted');
  emitProgress(options, 'transcribe', 100, 'Transcription complete');
  return readWhisperResult(result, timestamp);
}

async function transcribeWavFile(wavPath: string, timestamp: string, options: TranscriptionOptions): Promise<string> {
  const engine = getTranscriptionEngine(options);
  emitProgress(options, 'transcribe', 5, 'Transcribing audio');

  if (engine === ENGINE_OPENAI_API) {
    const text = await transcribeWithOpenAI(wavPath);
    emitProgress(options, 'transcribe', 100, 'Transcription complete');
    return text;
  }

  const clipTimestamps = await detectSpeechClipTimestamps(wavPath);
  if (clipTimestamps === '') {
    warnTranscriptionFallback('No speech ranges detected after silencedetect; returning an empty transcript.');
    emitProgress(options, 'transcribe', 100, 'Transcription complete');
    return '';
  }

  const child = engine === ENGINE_MLX_WHISPER
    ? await spawnMlxWhisperForInput(wavPath, timestamp, clipTimestamps ?? '')
    : await spawnOpenAIWhisperForInput(wavPath, timestamp, clipTimestamps ?? '');

  const result = await waitForPipeline([child]);
  emitProgress(options, 'transcribe', 100, 'Transcription complete');
  return readWhisperResult(result, timestamp);
}

async function spawnOpenAIWhisperForInput(input: string, timestamp: string, clipTimestamps = ''): Promise<LoggedChildProcess> {
  await assertCommandAvailable(getWhisperCommand());
  const command = getWhisperCommand();
  const outputDir = path.join(TMP_DIR, `whisper-${timestamp}`);
  const rawArgs = process.env.WHISPER_ARGS
    || '{input} --model base --language ru --condition_on_previous_text False --word_timestamps True --hallucination_silence_threshold 2 --clip_timestamps {clipTimestamps} --output_format txt --output_dir {outputDir}';
  const args = buildWhisperArgs(rawArgs, { input, outputDir, clipTimestamps });

  return spawnLogged(command, args, { captureStdout: true, extra: { outputDir } });
}

async function spawnMlxWhisperForInput(input: string, timestamp: string, clipTimestamps = ''): Promise<LoggedChildProcess> {
  await assertCommandAvailable(getMlxWhisperCommand());
  const command = getMlxWhisperCommand();
  const outputDir = path.join(TMP_DIR, `mlx-whisper-${timestamp}`);
  await mkdir(outputDir, { recursive: true });

  const rawArgs = process.env.MLX_WHISPER_ARGS
    || '{input} --model mlx-community/whisper-large-v3-turbo --language ru --condition-on-previous-text False --word-timestamps True --hallucination-silence-threshold 2 --clip-timestamps {clipTimestamps} -f txt -o {outputDir}';
  const args = buildWhisperArgs(rawArgs, { input, outputDir, clipTimestamps });

  return spawnLogged(command, args, { captureStdout: true, extra: { outputDir } });
}

async function detectSpeechClipTimestamps(wavPath: string): Promise<string | null> {
  const config = getTranscriptionVadConfig();

  try {
    const ffmpeg = spawnLogged(getFfmpegCommand(), [
      '-hide_banner',
      '-nostats',
      '-i',
      wavPath,
      '-af',
      `silencedetect=noise=${config.noiseDb}:d=${config.minSilenceSeconds}`,
      '-f',
      'null',
      '-'
    ]);

    await waitForPipeline([ffmpeg]);
    const parsed = parseSilencedetectOutput(ffmpeg.meta.stderr.join('\n'));

    if (parsed.durationSeconds === null) {
      warnTranscriptionFallback('Silencedetect did not report audio duration; falling back to full WAV.');
      return null;
    }

    const speechRanges = buildSpeechRanges({
      durationSeconds: parsed.durationSeconds,
      silenceRanges: parsed.silenceRanges,
      config
    });

    return formatClipTimestamps(speechRanges);
  } catch (error) {
    warnTranscriptionFallback(`Silencedetect failed; falling back to full WAV. ${errorMessage(error)}`);
    return null;
  }
}

async function transcribeWithOpenAI(wavPath: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw createHttpError(500, 'OPENAI_API_KEY is required when TRANSCRIPTION_ENGINE=openai.');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.audio.transcriptions.create({
    file: createReadStream(wavPath),
    model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'
  });

  return response.text || '';
}

async function finalizeTranscript(
  rawText: string,
  outputPath: string,
  meta: TranscriptFinalizeMeta,
  options: TranscriptionOptions
) {
  emitProgress(options, 'postprocess', 10, 'Post-processing transcript');
  const rawTranscript = normalizeRawTranscript(rawText);
  const cleanTranscript = postProcessTranscript(rawTranscript);
  const segments: TranscriptSegment[] = [];
  const summary = summarizeTranscript(cleanTranscript);
  const fileText = formatTranscriptFile({ summary, cleanTranscript, rawTranscript });
  await writeFile(outputPath, fileText, 'utf8');

  if (!options.screenshotsEnabled) {
    emitProgress(options, 'postprocess', 100, 'Transcript saved');
    return {
      text: cleanTranscript,
      rawText: rawTranscript,
      cleanText: cleanTranscript,
      summary,
      outputPath,
      source: meta.source,
      engine: meta.engine,
      segments
    };
  }

  emitProgress(options, 'postprocess', 100, 'Transcript saved');
  const intervalSeconds = normalizeScreenshotIntervalSeconds(options.screenshotIntervalSeconds);
  const obsidianResult = await createObsidianVault({
    title: meta.source,
    summary,
    cleanText: cleanTranscript,
    rawText: rawTranscript,
    source: meta.source,
    sourceType: meta.sourceType,
    engine: meta.engine,
    createdAt: new Date().toISOString(),
    videoHash: meta.videoHash,
    screenshotsEnabled: true,
    screenshotIntervalSeconds: intervalSeconds,
    screenshots: [],
    sourcePath: meta.sourcePath,
    sourceUrl: meta.sourceUrl,
    onProgress: options.onProgress
  });

  return {
    text: cleanTranscript,
    rawText: rawTranscript,
    cleanText: cleanTranscript,
    summary,
    outputPath,
    source: meta.source,
    engine: meta.engine,
    segments,
    markdownPath: obsidianResult.markdownPath,
    obsidianFolderPath: obsidianResult.obsidianFolderPath,
    screenshotsCount: obsidianResult.screenshotsCount
  };
}

async function readWhisperResult(result: PipelineResult, timestamp: string): Promise<string> {
  const whisper = result.processes.find((processInfo) => processInfo.extra?.outputDir);
  const outputDir = whisper?.extra?.outputDir;

  if (outputDir) {
    const candidates = await findTextFiles(outputDir);
    const [firstCandidate] = candidates;
    if (firstCandidate) {
      return readFile(firstCandidate, 'utf8');
    }
  }

  return result.stdout.join('\n').trim();
}

async function findTextFiles(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir);
    return names
      .filter((name) => name.endsWith('.txt'))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

async function assertCommandAvailable(command: string): Promise<void> {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  const checker = spawn(lookupCommand, [command], { stdio: ['ignore', 'ignore', 'ignore'] });

  const result = await new Promise<{ error?: Error | undefined; code?: number | null | undefined }>((resolve) => {
    checker.once('error', (error) => resolve({ error }));
    checker.once('close', (code) => resolve({ code }));
  });

  if (result.error) {
    throw createHttpError(500, `Required command not found: ${command}. Install it and make sure it is available in PATH.`);
  }

  if (result.code !== 0) {
    throw createHttpError(500, `Required command not found: ${command}. Install it and make sure it is available in PATH.`);
  }
}

function getYtDlpCommand(): string {
  return process.env.YTDLP_COMMAND || 'yt-dlp';
}

function getFfmpegCommand(): string {
  return process.env.FFMPEG_COMMAND || 'ffmpeg';
}

function getWhisperCommand(): string {
  return process.env.WHISPER_COMMAND || 'whisper';
}

function getMlxWhisperCommand(): string {
  return process.env.MLX_WHISPER_COMMAND || 'mlx_whisper';
}

function getTranscriptionEngine(options: TranscriptionOptions = {}): string {
  const engine = options.engine || process.env.TRANSCRIPTION_ENGINE || ENGINE_OPENAI_WHISPER;
  if (engine === 'local-file') return ENGINE_OPENAI_WHISPER;
  return engine;
}

function spawnLogged(command: string, args: string[], options: SpawnLoggedOptions = {}): LoggedChildProcess {
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: buildChildEnv()
  }) as LoggedChildProcess;

  child.meta = {
    command,
    args,
    stderr: [],
    stdout: options.captureStdout ? [] : undefined,
    extra: options.extra || {}
  };

  child.stderr.on('data', (chunk) => {
    const line = chunk.toString();
    child.meta.stderr.push(line);
    options.onStderr?.(line);
    process.stderr.write(`[${command}] ${line}`);
  });

  if (options.captureStdout) {
    child.stdout.on('data', (chunk) => {
      child.meta.stdout?.push(chunk.toString());
    });
  }

  child.on('error', (error) => {
    child.meta.error = error;
  });

  return child;
}

function emitProgress(options: TranscriptionOptions, stage: string, progress: number, message: string): void {
  options.onProgress?.({
    stage,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    message
  });
}

function parseYtDlpProgress(line: string): number | null {
  const match = line.match(/\[download]\s+(\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) : null;
}

function buildChildEnv(): NodeJS.ProcessEnv {
  const pathParts = [
    path.dirname(getYtDlpCommand()),
    path.dirname(getFfmpegCommand()),
    path.dirname(getWhisperCommand()),
    path.dirname(getMlxWhisperCommand()),
    process.env.PATH || ''
  ].filter(Boolean);

  return {
    ...process.env,
    PATH: [...new Set(pathParts)].join(path.delimiter)
  };
}

async function waitForPipeline(children: LoggedChildProcess[], writable?: NodeJS.WritableStream): Promise<PipelineResult> {
  const timeoutMs = DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => {
    for (const child of children) {
      child.kill('SIGTERM');
    }
  }, timeoutMs);

  try {
    const closePromises = children.map(waitForChild);
    const writerPromise = writable ? once(writable, 'finish') : Promise.resolve();
    await Promise.all([...closePromises, writerPromise]);

    return {
      processes: children.map((child) => child.meta),
      stdout: children.flatMap((child) => child.meta.stdout || [])
    };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForChild(child: LoggedChildProcess): Promise<void> {
  const [code, signal] = await once(child, 'close');
  if (code !== 0) {
    const stderr = child.meta.stderr.join('').trim();
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    throw createHttpError(500, `${child.meta.command} failed with ${reason}.${stderr ? ` stderr: ${stderr}` : ''}`);
  }
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeFileName(fileName: string): string {
  return path
    .basename(fileName)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+/, '') || `upload-${timestampForFile()}`;
}

function normalizeRawTranscript(rawText: string): string {
  return String(rawText || '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function warnTranscriptionFallback(message: string): void {
  process.stderr.write(`[transcribe] ${message}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatTranscriptFile({ summary, cleanTranscript, rawTranscript }: TranscriptFileParts): string {
  return [
    '# Summary',
    summary || 'No summary available.',
    '',
    '# Clean Transcript',
    cleanTranscript || 'No clean transcript available.',
    '',
    '# Raw Transcript',
    rawTranscript || 'No raw transcript available.',
    ''
  ].join('\n');
}
