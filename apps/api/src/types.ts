import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';
import type {
  HistoryEntry,
  JobStatus as SharedJobStatus,
  ProgressEvent,
  StageSummary,
  TranscriptionEngine,
  TranscriptionResult,
  VideoCompressionPreset,
  VideoFormat
} from '@transcribator/shared';

export type JobStatus = SharedJobStatus;
export type TerminalJobStatus = Extract<JobStatus, 'done' | 'error'>;

export interface JobMetadata {
  sourceType?: 'url' | 'file' | 'video-compression' | undefined;
  source?: string | undefined;
  engine?: TranscriptionEngine | undefined;
  preset?: VideoCompressionPreset | undefined;
}

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: number;
  metadata: JobMetadata;
  events: ProgressEvent[];
  emitter: EventEmitter;
}

export type JobEventWithoutTimestamp = ProgressEvent extends infer Event
  ? Event extends ProgressEvent
    ? Omit<Event, 'at'>
    : never
  : never;
export type PipelineProgressEvent = Omit<Extract<ProgressEvent, { type: 'progress' }>, 'type' | 'at'>;
export type ProgressHandler = (event: PipelineProgressEvent) => void;
export type JobTask = (onProgress: ProgressHandler) => Promise<TranscriptionResult>;

export interface CreateJobOptions {
  persistHistory?: boolean | undefined;
}

export interface TranscriptionOptions {
  engine?: TranscriptionEngine | undefined;
  onProgress?: ProgressHandler | undefined;
  screenshotsEnabled?: boolean | undefined;
  screenshotIntervalSeconds?: number | undefined;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string | null | undefined;
}

export interface TranscriptFinalizeMeta {
  source: string;
  sourceType: 'url' | 'file';
  engine: string;
  videoHash: string;
  sourcePath?: string | undefined;
  sourceUrl?: string | undefined;
}

export interface TranscriptFileParts {
  summary: string;
  cleanTranscript: string;
  rawTranscript: string;
}

export interface ChildProcessMeta {
  command: string;
  args: string[];
  stderr: string[];
  stdout?: string[] | undefined;
  extra: Record<string, string>;
  error?: Error | undefined;
}

export type LoggedChildProcess = ChildProcessWithoutNullStreams & {
  meta: ChildProcessMeta;
};

export interface SpawnLoggedOptions {
  captureStdout?: boolean | undefined;
  extra?: Record<string, string> | undefined;
  onStderr?: ((line: string) => void) | undefined;
}

export interface PipelineResult {
  processes: ChildProcessMeta[];
  stdout: string[];
}

export interface WaitForPipelineOptions {
  children: LoggedChildProcess[];
  writable?: Writable | undefined;
}

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  allowFailure?: boolean | undefined;
}

export interface YtDlpVideoFormatObject {
  format_id?: string | number | undefined;
  format_note?: string | undefined;
  ext?: string | undefined;
  resolution?: string | undefined;
  height?: number | string | null | undefined;
  width?: number | string | null | undefined;
  fps?: number | string | null | undefined;
  filesize?: number | null | undefined;
  filesize_approx?: number | null | undefined;
  acodec?: string | undefined;
  vcodec?: string | undefined;
}

export interface YtDlpVideoInfo {
  title?: string | undefined;
  formats?: YtDlpVideoFormatObject[] | undefined;
}

export type NormalizedVideoFormat = VideoFormat;
export type HistoryStageSummary = StageSummary;
export type JobHistoryEntry = HistoryEntry;
export type JobTranscriptionResult = TranscriptionResult;
