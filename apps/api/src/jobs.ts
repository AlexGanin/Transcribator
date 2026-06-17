import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { historyEntrySchema, type ProgressEvent } from '@transcribator/shared';
import type {
  HistoryStageSummary,
  Job,
  CreateJobOptions,
  JobEventWithoutTimestamp,
  JobHistoryEntry,
  JobMetadata,
  JobTask,
  JobTranscriptionResult,
  TerminalJobStatus
} from './types.js';

const jobs = new Map<string, Job>();
const MAX_JOB_AGE_MS = 60 * 60 * 1000;
const HISTORY_PATH = path.resolve(process.cwd(), '../..', 'runtime', 'output', 'history.json');

export function createJob(task: JobTask, metadata: JobMetadata = {}, options: CreateJobOptions = {}): Job {
  const id = randomUUID();
  const startedAt = Date.now();
  const persistHistory = options.persistHistory !== false;
  const job: Job = {
    id,
    status: 'running',
    createdAt: startedAt,
    metadata,
    events: [],
    emitter: new EventEmitter()
  };

  jobs.set(id, job);

  queueMicrotask(async () => {
    emitJobEvent(job, { type: 'started', jobId: id });

    try {
      const result = await task((event) => emitJobEvent(job, { type: 'progress', ...event }));
      job.status = 'done';
      emitJobEvent(job, { type: 'done', result });
      if (persistHistory) {
        await saveHistoryEntry(job, 'done', { result });
      }
    } catch (error) {
      job.status = 'error';
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      emitJobEvent(job, { type: 'error', error: message });
      if (persistHistory) {
        await saveHistoryEntry(job, 'error', { error: message });
      }
    }
  });

  cleanupOldJobs();
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export async function listHistory(): Promise<JobHistoryEntry[]> {
  const history = await readHistory();
  return history.sort((a, b) => b.startedAt - a.startedAt);
}

function emitJobEvent(job: Job, event: JobEventWithoutTimestamp): void {
  const payload = {
    ...event,
    at: Date.now()
  } as ProgressEvent;

  job.events.push(payload);
  job.emitter.emit('event', payload);
}

function cleanupOldJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > MAX_JOB_AGE_MS) {
      jobs.delete(id);
    }
  }
}

async function saveHistoryEntry(
  job: Job,
  status: TerminalJobStatus,
  finalEvent: { result?: JobTranscriptionResult | undefined; error?: string | undefined }
): Promise<void> {
  const history = await readHistory();
  const entry = buildHistoryEntry(job, status, finalEvent);
  history.unshift(entry);
  await writeFile(HISTORY_PATH, JSON.stringify(history.slice(0, 200), null, 2), 'utf8');
}

async function readHistory(): Promise<JobHistoryEntry[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(HISTORY_PATH, 'utf8'));
    return historyEntrySchema.array().catch([]).parse(parsed);
  } catch {
    return [];
  }
}

function buildHistoryEntry(
  job: Job,
  status: TerminalJobStatus,
  finalEvent: { result?: JobTranscriptionResult | undefined; error?: string | undefined }
): JobHistoryEntry {
  const startedAt = job.createdAt;
  const finishedAt = Date.now();
  const stages = summarizeStages(job.events);

  return {
    id: job.id,
    status,
    sourceType: job.metadata.sourceType,
    source: job.metadata.source,
    engine: job.metadata.engine,
    startedAt,
    finishedAt,
    elapsedSeconds: Math.floor((finishedAt - startedAt) / 1000),
    stages,
    outputPath: finalEvent.result?.outputPath || '',
    summary: finalEvent.result?.summary || '',
    cleanText: finalEvent.result?.cleanText || finalEvent.result?.text || '',
    rawText: finalEvent.result?.rawText || '',
    error: finalEvent.error || ''
  };
}

interface StageAccumulator {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  elapsedSeconds: number;
}

function summarizeStages(events: ProgressEvent[]): HistoryStageSummary[] {
  const stageMap = new Map<string, StageAccumulator>();

  for (const event of events) {
    if (event.type !== 'progress' || !event.stage) continue;

    const current = stageMap.get(event.stage) || {
      id: event.stage,
      startedAt: event.at,
      finishedAt: null,
      elapsedSeconds: 0
    };

    current.startedAt = Math.min(current.startedAt, event.at);
    if (event.progress >= 100) {
      current.finishedAt = event.at;
    }
    current.elapsedSeconds = Math.floor(((current.finishedAt || event.at) - current.startedAt) / 1000);
    stageMap.set(event.stage, current);
  }

  return [...stageMap.values()];
}
