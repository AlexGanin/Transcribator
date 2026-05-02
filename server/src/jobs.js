import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const jobs = new Map();
const MAX_JOB_AGE_MS = 60 * 60 * 1000;
const HISTORY_PATH = path.resolve(process.cwd(), '..', 'output', 'history.json');

export function createJob(task, metadata = {}) {
  const id = randomUUID();
  const startedAt = Date.now();
  const job = {
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
      await saveHistoryEntry(job, 'done', { result });
    } catch (error) {
      job.status = 'error';
      emitJobEvent(job, { type: 'error', error: error.message || 'Unexpected server error.' });
      await saveHistoryEntry(job, 'error', { error: error.message || 'Unexpected server error.' });
    }
  });

  cleanupOldJobs();
  return job;
}

export function getJob(id) {
  return jobs.get(id);
}

export async function listHistory() {
  const history = await readHistory();
  return history.sort((a, b) => b.startedAt - a.startedAt);
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

async function saveHistoryEntry(job, status, finalEvent) {
  const history = await readHistory();
  const entry = buildHistoryEntry(job, status, finalEvent);
  history.unshift(entry);
  await writeFile(HISTORY_PATH, JSON.stringify(history.slice(0, 200), null, 2), 'utf8');
}

async function readHistory() {
  try {
    return JSON.parse(await readFile(HISTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function buildHistoryEntry(job, status, finalEvent) {
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

function summarizeStages(events) {
  const stageMap = new Map();

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
