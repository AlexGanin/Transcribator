import { spawn } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHttpError } from './errors.js';
import type { ProgressHandler } from './types.js';
import type { VideoCompressionPreset, VideoCompressionResult } from '@transcribator/shared';

const ROOT_DIR = path.resolve(process.cwd(), '../..');
const RUNTIME_DIR = path.join(ROOT_DIR, 'runtime');
export const COMPRESSED_DIR = path.join(RUNTIME_DIR, 'compressed');
const DEFAULT_TIMEOUT_MS = Number(process.env.VIDEO_COMPRESS_TIMEOUT_MS || 60 * 60 * 1000);

export interface CompressionPresetConfig {
  id: VideoCompressionPreset;
  label: string;
  videoBitrate: string;
  audioBitrate: string;
}

export interface VideoCompressionOptions {
  preset?: VideoCompressionPreset | undefined;
  onProgress?: ProgressHandler | undefined;
}

interface VideoProbeMetadata {
  durationSeconds: number;
  width?: number | undefined;
  height?: number | undefined;
}

const COMPRESSION_PRESETS: Record<VideoCompressionPreset, CompressionPresetConfig> = {
  high: {
    id: 'high',
    label: 'Высокое качество',
    videoBitrate: '4500k',
    audioBitrate: '160k'
  },
  balanced: {
    id: 'balanced',
    label: 'Баланс',
    videoBitrate: '3500k',
    audioBitrate: '128k'
  },
  small: {
    id: 'small',
    label: 'Минимальный размер',
    videoBitrate: '2500k',
    audioBitrate: '96k'
  }
};

export async function ensureCompressedDir(): Promise<void> {
  await mkdir(COMPRESSED_DIR, { recursive: true });
}

export async function compressVideo(
  file: Express.Multer.File | undefined,
  options: VideoCompressionOptions = {}
): Promise<VideoCompressionResult> {
  if (!file) {
    throw createHttpError(400, 'Выберите видеофайл для сжатия.');
  }

  const preset = selectCompressionPreset(options.preset || 'balanced');
  const originalSizeBytes = (await stat(file.path)).size;
  const timestamp = timestampForFile();
  const outputFileName = buildCompressedFileName(file.originalname || file.filename, preset.id, timestamp);
  const outputPath = path.join(COMPRESSED_DIR, outputFileName);

  try {
    await ensureCompressedDir();
    await assertCommandAvailable(getFfmpegCommand(), 'ffmpeg');
    await assertCommandAvailable(getFfprobeCommand(), 'ffprobe');

    emitProgress(options, 'probe', 5, 'Читаю параметры видео');
    const metadata = await probeVideoMetadata(file.path);
    emitProgress(options, 'probe', 100, 'Параметры видео получены');

    await rm(outputPath, { force: true });
    await runCompression(file.path, outputPath, preset, metadata, options);

    const compressedSizeBytes = (await stat(outputPath)).size;
    const savedBytes = originalSizeBytes - compressedSizeBytes;

    return {
      outputPath,
      originalSizeBytes,
      compressedSizeBytes,
      savedBytes,
      savingsRatio: originalSizeBytes > 0 ? savedBytes / originalSizeBytes : 0,
      durationSeconds: metadata.durationSeconds,
      preset: preset.id
    };
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  } finally {
    await rm(file.path, { force: true });
  }
}

export function selectCompressionPreset(preset: VideoCompressionPreset = 'balanced'): CompressionPresetConfig {
  return COMPRESSION_PRESETS[preset] || COMPRESSION_PRESETS.balanced;
}

export function buildCompressedFileName(
  originalName: string,
  preset: VideoCompressionPreset,
  timestamp: string = timestampForFile()
): string {
  const baseName = String(originalName || 'video').replace(/\.[^./\\]+$/g, '');
  const base = safeFileName(baseName || 'video');
  return `${base}-${preset}-compressed-${timestamp}.mp4`;
}

export function parseFfmpegProgress(line: string, durationSeconds: number): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  const [rawKey, rawValue] = line.split('=');
  const key = rawKey?.trim();
  const value = rawValue?.trim();

  if (!key || !value) {
    return null;
  }

  const seconds = key === 'out_time_ms' || key === 'out_time_us'
    ? Number(value) / 1_000_000
    : key === 'out_time'
      ? parseTimestampSeconds(value)
      : null;

  if (seconds === null || !Number.isFinite(seconds)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round((seconds / durationSeconds) * 100)));
}

async function probeVideoMetadata(inputPath: string): Promise<VideoProbeMetadata> {
  const result = await runCommand(getFfprobeCommand(), [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height:format=duration',
    '-of',
    'json',
    inputPath
  ]);
  const parsed = JSON.parse(result.stdout) as {
    format?: { duration?: string | number | undefined } | undefined;
    streams?: Array<{ width?: number | string | undefined; height?: number | string | undefined }> | undefined;
  };
  const duration = Number(parsed.format?.duration);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw createHttpError(400, 'Не удалось определить длительность видео. Проверьте, что файл является видео.');
  }

  const videoStream = parsed.streams?.[0];
  const width = Number(videoStream?.width);
  const height = Number(videoStream?.height);

  return {
    durationSeconds: duration,
    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height } : {})
  };
}

export function buildFfmpegCompressionArgs(
  inputPath: string,
  outputPath: string,
  preset: CompressionPresetConfig,
  metadata?: Pick<VideoProbeMetadata, 'width' | 'height'> | undefined
): string[] {
  const args = [
    '-y',
    '-hide_banner',
    '-v',
    'error',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a?'
  ];

  if (shouldScaleToEvenDimensions(metadata)) {
    args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
  }

  args.push(
    '-c:v',
    'hevc_videotoolbox',
    '-profile:v',
    'main',
    '-b:v',
    preset.videoBitrate,
    '-tag:v',
    'hvc1',
    '-allow_sw',
    '0',
    '-prio_speed',
    '1',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    preset.audioBitrate,
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:2',
    '-nostats',
    outputPath
  );

  return args;
}

function shouldScaleToEvenDimensions(metadata?: Pick<VideoProbeMetadata, 'width' | 'height'> | undefined): boolean {
  const width = metadata?.width;
  const height = metadata?.height;

  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height)) {
    return true;
  }

  return width % 2 !== 0 || height % 2 !== 0;
}

function runCompression(
  inputPath: string,
  outputPath: string,
  preset: CompressionPresetConfig,
  metadata: VideoProbeMetadata,
  options: VideoCompressionOptions
): Promise<void> {
  emitProgress(options, 'compress', 1, 'Сжимаю видео через VideoToolbox');
  const args = buildFfmpegCompressionArgs(inputPath, outputPath, preset, metadata);

  return new Promise<void>((resolve, reject) => {
    const child = spawn(getFfmpegCommand(), args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: buildChildEnv([getFfmpegCommand(), getFfprobeCommand()])
    });
    const stderrLines: string[] = [];
    let buffered = '';
    let lastProgress = 1;
    const timeout = windowlessSetTimeout(() => {
      child.kill('SIGTERM');
      reject(createHttpError(500, 'Сжатие видео заняло слишком много времени и было остановлено.'));
    }, DEFAULT_TIMEOUT_MS);

    child.stderr.on('data', (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() || '';

      for (const line of lines) {
        if (!line) continue;
        stderrLines.push(line);
        const parsedProgress = parseFfmpegProgress(line, metadata.durationSeconds);

        if (parsedProgress !== null) {
          lastProgress = Math.max(lastProgress, Math.min(99, parsedProgress));
          emitProgress(options, 'compress', lastProgress, 'Сжимаю видео через VideoToolbox');
        }
      }
    });

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(createHttpError(500, `Не удалось запустить ffmpeg: ${error.message}`));
    });

    child.once('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        reject(createHttpError(500, `Не удалось сжать видео через ffmpeg.${formatStderr(stderrLines)}`));
        return;
      }

      emitProgress(options, 'compress', 100, 'Видео сжато через VideoToolbox');
      resolve();
    });
  });
}

function emitProgress(options: VideoCompressionOptions, stage: string, progress: number, message: string): void {
  options.onProgress?.({
    stage,
    progress: Math.max(0, Math.min(100, progress)),
    message
  });
}

async function assertCommandAvailable(command: string, label: string): Promise<void> {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = await runCommand(lookupCommand, [command], { allowFailure: true });

  if (result.code !== 0) {
    throw createHttpError(500, `Не найдена команда ${label}: ${command}. Установите ее или задайте путь в apps/api/.env.`);
  }
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface RunCommandOptions {
  allowFailure?: boolean | undefined;
}

function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildChildEnv([command])
    });
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
    child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
    child.once('error', (error) => {
      if (options.allowFailure) {
        resolve({ code: 1, stdout: '', stderr: error.message });
        return;
      }
      reject(createHttpError(500, error.message));
    });
    child.once('close', (code) => {
      const result = {
        code,
        stdout: stdout.join(''),
        stderr: stderr.join('')
      };

      if (code !== 0 && !options.allowFailure) {
        reject(createHttpError(500, `${command} failed with exit code ${code}.${formatStderr(stderr)}`));
        return;
      }

      resolve(result);
    });
  });
}

function getFfmpegCommand(): string {
  return process.env.FFMPEG_COMMAND || 'ffmpeg';
}

function getFfprobeCommand(): string {
  return process.env.FFPROBE_COMMAND || 'ffprobe';
}

function buildChildEnv(commands: string[]): NodeJS.ProcessEnv {
  const commandDirs = commands.map((command) => path.dirname(command)).filter((part) => part && part !== '.');
  const pathParts = [...commandDirs, process.env.PATH || ''].filter(Boolean);

  return {
    ...process.env,
    PATH: [...new Set(pathParts)].join(path.delimiter)
  };
}

function safeFileName(value: string): string {
  return String(value || 'video')
    .replace(/[\\/]+/g, '_')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .replace(/\.+$/g, '') || 'video';
}

function parseTimestampSeconds(value: string): number | null {
  const match = value.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function formatStderr(stderrLines: string[]): string {
  const tail = stderrLines.slice(-8).join('\n').trim();
  return tail ? `\n${tail}` : '';
}

function windowlessSetTimeout(callback: () => void, ms: number): NodeJS.Timeout {
  return setTimeout(callback, ms);
}
