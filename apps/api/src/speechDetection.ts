export interface SilenceRange {
  start: number;
  end: number | null;
}

export interface SpeechRange {
  start: number;
  end: number;
}

export interface SilencedetectResult {
  durationSeconds: number | null;
  silenceRanges: SilenceRange[];
}

export interface TranscriptionVadConfig {
  noiseDb: string;
  minSilenceSeconds: number;
  speechPaddingSeconds: number;
  minSpeechSeconds: number;
}

interface BuildSpeechRangesInput {
  durationSeconds: number | null;
  silenceRanges: SilenceRange[];
  config: TranscriptionVadConfig;
}

const DEFAULT_VAD_CONFIG: TranscriptionVadConfig = {
  noiseDb: '-35dB',
  minSilenceSeconds: 1,
  speechPaddingSeconds: 0.25,
  minSpeechSeconds: 0.4
};

export function getTranscriptionVadConfig(env: NodeJS.ProcessEnv = process.env): TranscriptionVadConfig {
  return {
    noiseDb: env.TRANSCRIBE_SILENCE_NOISE_DB || DEFAULT_VAD_CONFIG.noiseDb,
    minSilenceSeconds: parsePositiveNumber(env.TRANSCRIBE_MIN_SILENCE_SECONDS, DEFAULT_VAD_CONFIG.minSilenceSeconds),
    speechPaddingSeconds: parseNonNegativeNumber(
      env.TRANSCRIBE_SPEECH_PADDING_SECONDS,
      DEFAULT_VAD_CONFIG.speechPaddingSeconds
    ),
    minSpeechSeconds: parsePositiveNumber(env.TRANSCRIBE_MIN_SPEECH_SECONDS, DEFAULT_VAD_CONFIG.minSpeechSeconds)
  };
}

export function parseSilencedetectOutput(output: string): SilencedetectResult {
  const silenceRanges: SilenceRange[] = [];
  let durationSeconds: number | null = null;

  for (const line of output.split(/\r?\n/)) {
    const durationMatch = line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (durationMatch) {
      durationSeconds = parseDuration(Number(durationMatch[1]), Number(durationMatch[2]), Number(durationMatch[3]));
    }

    const startMatch = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
    if (startMatch) {
      silenceRanges.push({ start: Math.max(0, Number(startMatch[1])), end: null });
    }

    const endMatch = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);
    if (endMatch) {
      const lastOpenRange = [...silenceRanges].reverse().find((range) => range.end === null);
      if (lastOpenRange) {
        lastOpenRange.end = Math.max(lastOpenRange.start, Number(endMatch[1]));
      }
    }
  }

  return { durationSeconds, silenceRanges };
}

export function buildSpeechRanges({ durationSeconds, silenceRanges, config }: BuildSpeechRangesInput): SpeechRange[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds === null || durationSeconds <= 0) {
    return [];
  }

  const duration = durationSeconds;
  const normalizedSilences = silenceRanges
    .map((range) => ({
      start: clamp(range.start, 0, duration),
      end: clamp(range.end ?? duration, 0, duration)
    }))
    .filter((range) => range.end >= range.start)
    .sort((a, b) => a.start - b.start);

  const rawSpeechRanges: SpeechRange[] = [];
  let cursor = 0;

  for (const silence of normalizedSilences) {
    if (silence.start > cursor) {
      rawSpeechRanges.push({ start: cursor, end: silence.start });
    }
    cursor = Math.max(cursor, silence.end);
  }

  if (cursor < duration) {
    rawSpeechRanges.push({ start: cursor, end: duration });
  }

  const paddedRanges = rawSpeechRanges
    .filter((range) => range.end - range.start >= config.minSpeechSeconds)
    .map((range) => ({
      start: roundSeconds(clamp(range.start - config.speechPaddingSeconds, 0, duration)),
      end: roundSeconds(clamp(range.end + config.speechPaddingSeconds, 0, duration))
    }));

  return mergeSpeechRanges(paddedRanges, Math.max(config.speechPaddingSeconds * 2, 0.05));
}

export function formatClipTimestamps(ranges: SpeechRange[]): string {
  return ranges
    .flatMap((range) => [range.start, range.end])
    .map(formatSeconds)
    .join(',');
}

function mergeSpeechRanges(ranges: SpeechRange[], maxGapSeconds: number): SpeechRange[] {
  const merged: SpeechRange[] = [];

  for (const range of ranges) {
    const previous = merged.at(-1);
    if (!previous) {
      merged.push({ ...range });
      continue;
    }

    if (range.start <= previous.end + maxGapSeconds) {
      previous.end = roundSeconds(Math.max(previous.end, range.end));
      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

function parseDuration(hours: number, minutes: number, seconds: number): number {
  return hours * 3600 + minutes * 60 + seconds;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(2));
}

function formatSeconds(value: number): string {
  return String(Number(value.toFixed(2)));
}
