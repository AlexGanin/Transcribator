import { postProcessTranscript } from './postProcess.js';
import type { TranscriptFinalizeMeta, TranscriptSegment } from './types.js';
import type { TranscriptionStore } from './transcriptionStore.js';

export interface PersistTranscriptTextOptions {
  store: TranscriptionStore;
  transcriptionId: string;
  createdAt: number;
  rawText: string;
  meta: TranscriptFinalizeMeta;
}

export interface PersistedTranscriptResult {
  [key: string]: unknown;
  text: string;
  rawText: string;
  cleanText: string;
  formattedText: string;
  summary: string;
  source: string;
  engine: string;
  segments: TranscriptSegment[];
}

export function persistTranscriptText(options: PersistTranscriptTextOptions): PersistedTranscriptResult {
  const rawTranscript = normalizeRawTranscript(options.rawText);
  options.store.upsertTranscription({
    id: options.transcriptionId,
    status: 'running',
    title: options.meta.source,
    source: options.meta.source,
    sourceType: options.meta.sourceType,
    engine: options.meta.engine,
    rawText: rawTranscript,
    summary: '',
    formattedText: '',
    createdAt: options.createdAt,
    updatedAt: Date.now()
  });

  const cleanTranscript = postProcessTranscript(rawTranscript);
  const segments: TranscriptSegment[] = [];
  options.store.patchTranscription(options.transcriptionId, {
    cleanText: cleanTranscript,
    summary: '',
    formattedText: ''
  });

  return {
    text: cleanTranscript,
    rawText: rawTranscript,
    cleanText: cleanTranscript,
    formattedText: '',
    summary: '',
    source: options.meta.source,
    engine: options.meta.engine,
    segments
  };
}

function normalizeRawTranscript(rawText: string): string {
  return String(rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
