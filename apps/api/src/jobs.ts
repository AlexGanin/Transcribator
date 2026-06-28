import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { ProgressEvent } from '@transcribator/shared';
import type {
  Job,
  JobEventWithoutTimestamp,
  JobMetadata,
  JobTask
} from './types.js';

const jobs = new Map<string, Job>();
const MAX_JOB_AGE_MS = 60 * 60 * 1000;

export function createJob(task: JobTask, metadata: JobMetadata = {}): Job {
  const id = randomUUID();
  const startedAt = Date.now();
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
    } catch (error) {
      job.status = 'error';
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      emitJobEvent(job, { type: 'error', error: message });
    }
  });

  cleanupOldJobs();
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
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
