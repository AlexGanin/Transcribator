import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

const jobs = new Map();
const MAX_JOB_AGE_MS = 60 * 60 * 1000;

export function createJob(task) {
  const id = randomUUID();
  const job = {
    id,
    status: 'running',
    createdAt: Date.now(),
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
    } catch (error) {
      job.status = 'error';
      emitJobEvent(job, { type: 'error', error: error.message || 'Unexpected server error.' });
    }
  });

  cleanupOldJobs();
  return job;
}

export function getJob(id) {
  return jobs.get(id);
}

function emitJobEvent(job, event) {
  const payload = {
    ...event,
    at: Date.now()
  };

  job.events.push(payload);
  job.emitter.emit('event', payload);
}

function cleanupOldJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > MAX_JOB_AGE_MS) {
      jobs.delete(id);
    }
  }
}
