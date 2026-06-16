import { z } from 'zod';

export const transcriptionEngineSchema = z.enum([
  'mlx-whisper',
  'openai-whisper',
  'openai',
  'local-stdin'
]);

export const jobStatusSchema = z.enum(['running', 'done', 'error']);

export const apiErrorSchema = z.object({
  error: z.string()
});

export const healthResponseSchema = z.object({
  ok: z.boolean()
});

export const urlTranscriptionRequestSchema = z.object({
  url: z.string().url(),
  engine: transcriptionEngineSchema.optional()
});

export const fileTranscriptionRequestSchema = z.object({
  engine: transcriptionEngineSchema.optional()
});

export const jobIdResponseSchema = z.object({
  jobId: z.string().min(1)
});

export const stageSummarySchema = z.object({
  id: z.string(),
  startedAt: z.number().nullable().optional(),
  finishedAt: z.number().nullable().optional(),
  elapsedSeconds: z.number().default(0)
});

export const transcriptionResultSchema = z.object({
  text: z.string().optional(),
  rawText: z.string().optional(),
  cleanText: z.string().optional(),
  summary: z.string().optional(),
  outputPath: z.string().optional(),
  source: z.string().optional(),
  engine: z.string().optional()
}).catchall(z.unknown());

export const progressEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('started'),
    jobId: z.string(),
    at: z.number()
  }),
  z.object({
    type: z.literal('progress'),
    stage: z.string(),
    progress: z.number(),
    message: z.string().optional(),
    at: z.number()
  }),
  z.object({
    type: z.literal('done'),
    result: transcriptionResultSchema.optional(),
    at: z.number()
  }),
  z.object({
    type: z.literal('error'),
    error: z.string(),
    at: z.number()
  })
]);

export const historyEntrySchema = z.object({
  id: z.string(),
  status: z.enum(['done', 'error']),
  sourceType: z.string().optional(),
  source: z.string().optional(),
  engine: z.string().optional(),
  startedAt: z.number(),
  finishedAt: z.number(),
  elapsedSeconds: z.number().default(0),
  stages: z.array(stageSummarySchema).default([]),
  outputPath: z.string().default(''),
  summary: z.string().default(''),
  cleanText: z.string().default(''),
  rawText: z.string().default(''),
  error: z.string().default('')
});

export const historyResponseSchema = z.object({
  history: z.array(historyEntrySchema)
});

export const videoFormatSchema = z.object({
  id: z.string(),
  label: z.string(),
  ext: z.string().default('mp4'),
  resolution: z.string().default(''),
  height: z.number().nullable(),
  width: z.number().nullable(),
  fps: z.number().nullable(),
  sizeLabel: z.string().default(''),
  hasAudio: z.boolean(),
  hasVideo: z.boolean()
});

export const videoFormatsRequestSchema = z.object({
  url: z.string().url()
});

export const videoFormatsResponseSchema = z.object({
  title: z.string(),
  formats: z.array(videoFormatSchema)
});

export const videoDownloadRequestSchema = z.object({
  url: z.string().url(),
  formatId: z.string().min(1)
});

export const videoDownloadResponseSchema = z.object({
  outputPath: z.string(),
  title: z.string(),
  format: videoFormatSchema
});

export type TranscriptionEngine = z.infer<typeof transcriptionEngineSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type UrlTranscriptionRequest = z.infer<typeof urlTranscriptionRequestSchema>;
export type FileTranscriptionRequest = z.infer<typeof fileTranscriptionRequestSchema>;
export type JobIdResponse = z.infer<typeof jobIdResponseSchema>;
export type StageSummary = z.infer<typeof stageSummarySchema>;
export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;
export type ProgressEvent = z.infer<typeof progressEventSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type HistoryResponse = z.infer<typeof historyResponseSchema>;
export type VideoFormat = z.infer<typeof videoFormatSchema>;
export type VideoFormatsRequest = z.infer<typeof videoFormatsRequestSchema>;
export type VideoFormatsResponse = z.infer<typeof videoFormatsResponseSchema>;
export type VideoDownloadRequest = z.infer<typeof videoDownloadRequestSchema>;
export type VideoDownloadResponse = z.infer<typeof videoDownloadResponseSchema>;
