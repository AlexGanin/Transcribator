import { postProcessTranscript } from './postProcess.js';
import type { TranscriptFinalizeMeta, TranscriptSegment } from './types.js';

export interface PersistTranscriptTextOptions {
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
  const cleanTranscript = postProcessTranscript(rawTranscript);
  const segments: TranscriptSegment[] = [];

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
