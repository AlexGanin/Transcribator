import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { ProgressEvent } from '@transcribator/shared';
import { defaultTranscriptionStore } from './transcriptionStore.js';
import type {
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
      const result = await task(
        (event) => emitJobEvent(job, { type: 'progress', ...event }),
        { jobId: id, startedAt, metadata }
      );
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
  return defaultTranscriptionStore.listHistory();
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
  const finishedAt = Date.now();
  const current = defaultTranscriptionStore.getTranscription(job.id);
  const values = {
    status,
    title: job.metadata.source || current?.title || '',
    sourceType: job.metadata.sourceType || current?.sourceType || '',
    source: finalEvent.result?.source || job.metadata.source || current?.source || '',
    engine: finalEvent.result?.engine || job.metadata.engine || current?.engine || '',
    rawText: finalEvent.result?.rawText || current?.rawText || '',
    cleanText: finalEvent.result?.cleanText || finalEvent.result?.text || current?.cleanText || '',
    formattedText: finalEvent.result?.formattedText || current?.formattedText || '',
    summary: finalEvent.result?.summary || current?.summary || '',
    markdownPath: finalEvent.result?.markdownPath || current?.markdownPath || '',
    error: finalEvent.error || current?.error || '',
    updatedAt: finishedAt,
    finishedAt,
  };

  if (current) {
    defaultTranscriptionStore.patchTranscription(job.id, values);
  } else {
    defaultTranscriptionStore.upsertTranscription({
      id: job.id,
      ...values,
      createdAt: job.createdAt
    });
  }
}
