import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHttpError } from './errors.js';
import type {
  CommandResult,
  NormalizedVideoFormat,
  RunCommandOptions,
  YtDlpVideoFormatObject,
  YtDlpVideoInfo
} from './types.js';
import type { VideoDownloadResponse, VideoFormatsResponse } from '@transcribator/shared';

const ROOT_DIR = path.resolve(process.cwd(), '../..');
export const DOWNLOAD_DIR = path.join(ROOT_DIR, 'downloads');

export async function ensureDownloadDir(): Promise<void> {
  await mkdir(DOWNLOAD_DIR, { recursive: true });
}

export async function getVideoFormats(inputUrl: string): Promise<VideoFormatsResponse> {
  assertHttpUrl(inputUrl);
  await assertCommandAvailable(getYtDlpCommand());

  const info = await getVideoInfo(inputUrl);
  return {
    title: info.title || 'video',
    formats: normalizeFormats(info.formats || [])
  };
}

export async function downloadVideo(inputUrl: string, formatId: string): Promise<VideoDownloadResponse> {
  assertHttpUrl(inputUrl);
  if (!formatId || typeof formatId !== 'string') {
    throw createHttpError(400, 'Video format is required.');
  }

  await ensureDownloadDir();
  await assertCommandAvailable(getYtDlpCommand());

  const info = await getVideoInfo(inputUrl);
  const formats = normalizeFormats(info.formats || []);
  const selected = formats.find((format) => format.id === formatId);

  if (!selected) {
    throw createHttpError(400, 'Selected video format is not available.');
  }

  const ext = selected.ext || 'mp4';
  const fileName = safeDownloadFileName(`${info.title || 'video'}-${formatId}`, ext);
  const outputPath = path.join(DOWNLOAD_DIR, fileName);
  const formatExpression = selected.hasAudio ? formatId : `${formatId}+bestaudio/best`;
  const args = [
    '--no-playlist',
    '-f',
    formatExpression,
    '--merge-output-format',
    ext,
    '-o',
    outputPath,
    inputUrl
  ];

  await runCommand(getYtDlpCommand(), args);

  return {
    outputPath,
    title: info.title || 'video',
    format: selected
  };
}

export function normalizeFormats(formats: YtDlpVideoFormatObject[]): NormalizedVideoFormat[] {
  return formats
    .filter((format) => isVideoFormat(format))
    .map((format) => {
      const hasAudio = Boolean(format.acodec && format.acodec !== 'none');
      const size = format.filesize || format.filesize_approx || 0;
      const approximate = !format.filesize && Boolean(format.filesize_approx);
      const sizeLabel = size > 0 ? formatBytes(size, approximate) : '';
      const height = Number(format.height) || null;
      const width = Number(format.width) || null;
      const resolution = format.resolution || (width && height ? `${width}x${height}` : '');
      const qualityLabel = height ? `${height}p` : resolution || format.format_note || 'video';
      const labelParts = [
        qualityLabel,
        format.ext,
        format.fps ? `${format.fps}fps` : '',
        sizeLabel,
        hasAudio ? '' : 'audio will be merged'
      ].filter(Boolean);

      return {
        id: String(format.format_id),
        label: labelParts.join(' · '),
        ext: format.ext || 'mp4',
        resolution,
        height,
        width,
        fps: Number(format.fps) || null,
        sizeLabel,
        hasAudio,
        hasVideo: true
      };
    })
    .sort((a, b) => (b.height || 0) - (a.height || 0) || sizeNumber(b.sizeLabel) - sizeNumber(a.sizeLabel));
}

export function safeDownloadFileName(title: string, ext: string): string {
  const cleanBase = String(title || 'video')
    .replace(/[\\/]+/g, '_')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .replace(/\.+$/g, '') || 'video';
  const cleanExt = String(ext || 'mp4').replace(/[^\w]+/g, '') || 'mp4';
  return `${cleanBase}.${cleanExt}`;
}

async function getVideoInfo(inputUrl: string): Promise<YtDlpVideoInfo> {
  const result = await runCommand(getYtDlpCommand(), ['--dump-json', '--no-playlist', inputUrl]);
  try {
    const parsed: unknown = JSON.parse(result.stdout);
    if (isYtDlpVideoInfo(parsed)) {
      return parsed;
    }
    throw new Error('Invalid yt-dlp metadata shape.');
  } catch {
    throw createHttpError(500, 'Could not parse video metadata from yt-dlp.');
  }
}

function isVideoFormat(format: YtDlpVideoFormatObject): format is YtDlpVideoFormatObject & { format_id: string | number } {
  return Boolean(format?.format_id && format.vcodec && format.vcodec !== 'none');
}

async function assertCommandAvailable(command: string): Promise<void> {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = await runCommand(lookupCommand, [command], { allowFailure: true });

  if (result.code !== 0) {
    throw createHttpError(500, `Required command not found: ${command}. Install it and make sure it is available in PATH.`);
  }
}

function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildChildEnv()
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
        reject(createHttpError(500, `${command} failed with exit code ${code}.${result.stderr ? ` stderr: ${result.stderr.trim()}` : ''}`));
        return;
      }

      resolve(result);
    });
  });
}

function getYtDlpCommand(): string {
  return process.env.YTDLP_COMMAND || 'yt-dlp';
}

function buildChildEnv(): NodeJS.ProcessEnv {
  const commandDir = path.dirname(getYtDlpCommand());
  const pathParts = [commandDir, process.env.PATH || ''].filter(Boolean);
  return {
    ...process.env,
    PATH: [...new Set(pathParts)].join(path.delimiter)
  };
}

function assertHttpUrl(inputUrl: string): void {
  if (!inputUrl || typeof inputUrl !== 'string') {
    throw createHttpError(400, 'URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw createHttpError(400, 'Invalid URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createHttpError(400, 'Only http and https URLs are supported.');
  }
}

function formatBytes(bytes: number, approximate: boolean): string {
  const mb = bytes / 1024 / 1024;
  const value = mb >= 10 ? Math.round(mb) : Number(mb.toFixed(1));
  return `${approximate ? '~' : ''}${value} MB`;
}

function sizeNumber(label: string): number {
  return Number(String(label).replace(/[^\d.]/g, '')) || 0;
}

function isYtDlpVideoInfo(value: unknown): value is YtDlpVideoInfo {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const info = value as { title?: unknown; formats?: unknown };
  return (
    (info.title === undefined || typeof info.title === 'string') &&
    (info.formats === undefined || Array.isArray(info.formats))
  );
}
