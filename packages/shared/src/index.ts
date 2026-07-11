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

const optionalBooleanRequestSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  return value;
}, z.boolean().default(false));

const screenshotIntervalSecondsSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'string') return Number(value);
  return value;
}, z.number().int().min(1).max(3600).default(30));

export const transcriptionArtifactOptionsSchema = z.object({
  screenshotsEnabled: optionalBooleanRequestSchema,
  screenshotIntervalSeconds: screenshotIntervalSecondsSchema
});

export const urlTranscriptionRequestSchema = z.object({
  url: z.string().url(),
  engine: transcriptionEngineSchema.optional()
}).extend({
  ...transcriptionArtifactOptionsSchema.shape
});

export const fileTranscriptionRequestSchema = z.object({
  engine: transcriptionEngineSchema.optional()
}).extend({
  ...transcriptionArtifactOptionsSchema.shape
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

export const videoCompressionPresetSchema = z.enum(['high', 'balanced', 'small']);
export const youtubeVideoStatusSchema = z.enum(['added', 'processing', 'done', 'error']);
export const videoSourceTypeSchema = z.enum(['youtube', 'file']);

export const screenshotFileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^/\\]+\.jpg$/i, 'Invalid screenshot file name.');

export const videoScreenshotScopeSchema = z.enum(['active', 'trash']);

export const videoScreenshotSchema = z.object({
  fileName: screenshotFileNameSchema,
  timestampSeconds: z.number().nonnegative().default(0),
  exists: z.boolean().default(true),
  url: z.string().default('')
});

export const videoScreenshotsRequestSchema = z.object({
  fileNames: z.array(screenshotFileNameSchema).min(1)
}).strict();

export const transcriptionResultSchema = z.object({
  text: z.string().optional(),
  rawText: z.string().optional(),
  cleanText: z.string().optional(),
  formattedText: z.string().optional(),
  summary: z.string().optional(),
  outputPath: z.string().optional(),
  markdownPath: z.string().optional(),
  obsidianFolderPath: z.string().optional(),
  screenshots: z.array(videoScreenshotSchema).optional(),
  screenshotsCount: z.number().int().nonnegative().optional(),
  source: z.string().optional(),
  engine: z.string().optional(),
  originalSizeBytes: z.number().nonnegative().optional(),
  compressedSizeBytes: z.number().nonnegative().optional(),
  savedBytes: z.number().optional(),
  savingsRatio: z.number().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  preset: videoCompressionPresetSchema.optional()
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

export const updateYouTubeVideoTranscriptRequestSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().optional(),
  channelTitle: z.string().max(300).optional(),
  summary: z.string().optional(),
  cleanText: z.string().optional(),
  formattedText: z.string().optional(),
  rawText: z.string().optional()
}).strict();

export const youtubeVideoTranscriptionRequestSchema = z.object({
  engine: transcriptionEngineSchema.optional()
}).extend({
  ...transcriptionArtifactOptionsSchema.shape
}).strict();

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

export const youtubeVideoSchema = z.object({
  id: z.string(),
  sourceType: videoSourceTypeSchema.default('youtube'),
  youtubeVideoId: z.string(),
  url: z.string().min(1),
  sourcePath: z.string().default(''),
  originalFileName: z.string().default(''),
  title: z.string().default(''),
  description: z.string().default(''),
  channelTitle: z.string().default(''),
  channelId: z.string().default(''),
  channelUrl: z.string().default(''),
  uploader: z.string().default(''),
  uploaderId: z.string().default(''),
  uploaderUrl: z.string().default(''),
  thumbnailUrl: z.string().default(''),
  durationSeconds: z.number().nonnegative().nullable().default(null),
  durationLabel: z.string().default(''),
  uploadDate: z.string().default(''),
  timestamp: z.number().nullable().default(null),
  viewCount: z.number().nonnegative().nullable().default(null),
  likeCount: z.number().nonnegative().nullable().default(null),
  commentCount: z.number().nonnegative().nullable().default(null),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  language: z.string().default(''),
  availability: z.string().default(''),
  liveStatus: z.string().default(''),
  ageLimit: z.number().nonnegative().nullable().default(null),
  webpageUrl: z.string().default(''),
  formats: z.array(videoFormatSchema).default([]),
  metadataFetchedAt: z.number().nullable().default(null),
  status: youtubeVideoStatusSchema,
  transcriptionJobId: z.string().default(''),
  transcriptionEngine: z.string().default(''),
  rawText: z.string().default(''),
  cleanText: z.string().default(''),
  formattedText: z.string().default(''),
  summary: z.string().default(''),
  markdownPath: z.string().default(''),
  transcriptionError: z.string().default(''),
  transcriptionStartedAt: z.number().nullable().default(null),
  transcriptionFinishedAt: z.number().nullable().default(null),
  screenshots: z.array(videoScreenshotSchema).default([]),
  trashedScreenshots: z.array(videoScreenshotSchema).default([]),
  createdAt: z.number(),
  updatedAt: z.number()
});

export const youtubeVideoCreateRequestSchema = z.object({
  url: z.string().url(),
  title: z.string().max(500).optional(),
  channelTitle: z.string().max(300).optional(),
  thumbnailUrl: z.string().url().optional()
}).strict();

export const youtubeVideoListResponseSchema = z.object({
  videos: z.array(youtubeVideoSchema)
});

export const youtubeVideoAddResponseSchema = z.object({
  video: youtubeVideoSchema,
  alreadyAdded: z.boolean()
});

export const youtubeVideoCheckRequestSchema = z.object({
  url: z.string().url()
});

export const youtubeVideoCheckResponseSchema = z.object({
  added: z.boolean(),
  video: youtubeVideoSchema.optional()
});

export const youtubeVideoDetailResponseSchema = z.object({
  video: youtubeVideoSchema,
  metadataError: z.string().optional()
});

export const youtubeVideoTranscriptionStartResponseSchema = z.object({
  video: youtubeVideoSchema,
  jobId: z.string().min(1)
});

export const youtubeVideoTranscriptResponseSchema = z.object({
  video: youtubeVideoSchema
});

export const youtubeVideoScreenshotsOperationResponseSchema = youtubeVideoTranscriptResponseSchema.extend({
  moved: z.array(screenshotFileNameSchema).default([]),
  missing: z.array(screenshotFileNameSchema).default([]),
  deleted: z.array(screenshotFileNameSchema).default([])
});

export const videoCompressionRequestSchema = z.object({
  preset: videoCompressionPresetSchema.default('balanced')
});

export const videoCompressionResultSchema = z.object({
  outputPath: z.string(),
  originalSizeBytes: z.number().nonnegative(),
  compressedSizeBytes: z.number().nonnegative(),
  savedBytes: z.number(),
  savingsRatio: z.number(),
  durationSeconds: z.number().nonnegative(),
  preset: videoCompressionPresetSchema
});

export type TranscriptionEngine = z.infer<typeof transcriptionEngineSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type UrlTranscriptionRequest = z.infer<typeof urlTranscriptionRequestSchema>;
export type FileTranscriptionRequest = z.infer<typeof fileTranscriptionRequestSchema>;
export type TranscriptionArtifactOptions = z.infer<typeof transcriptionArtifactOptionsSchema>;
export type JobIdResponse = z.infer<typeof jobIdResponseSchema>;
export type StageSummary = z.infer<typeof stageSummarySchema>;
export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;
export type ProgressEvent = z.infer<typeof progressEventSchema>;
export type ScreenshotFileName = z.infer<typeof screenshotFileNameSchema>;
export type VideoScreenshotScope = z.infer<typeof videoScreenshotScopeSchema>;
export type VideoScreenshot = z.infer<typeof videoScreenshotSchema>;
export type VideoScreenshotsRequest = z.infer<typeof videoScreenshotsRequestSchema>;
export type UpdateYouTubeVideoTranscriptRequest = z.infer<typeof updateYouTubeVideoTranscriptRequestSchema>;
export type YouTubeVideoTranscriptionRequest = z.infer<typeof youtubeVideoTranscriptionRequestSchema>;
export type VideoFormat = z.infer<typeof videoFormatSchema>;
export type VideoFormatsRequest = z.infer<typeof videoFormatsRequestSchema>;
export type VideoFormatsResponse = z.infer<typeof videoFormatsResponseSchema>;
export type VideoDownloadRequest = z.infer<typeof videoDownloadRequestSchema>;
export type VideoDownloadResponse = z.infer<typeof videoDownloadResponseSchema>;
export type YouTubeVideoStatus = z.infer<typeof youtubeVideoStatusSchema>;
export type VideoSourceType = z.infer<typeof videoSourceTypeSchema>;
export type YouTubeVideo = z.infer<typeof youtubeVideoSchema>;
export type YouTubeVideoCreateRequest = z.infer<typeof youtubeVideoCreateRequestSchema>;
export type YouTubeVideoListResponse = z.infer<typeof youtubeVideoListResponseSchema>;
export type YouTubeVideoAddResponse = z.infer<typeof youtubeVideoAddResponseSchema>;
export type YouTubeVideoCheckRequest = z.infer<typeof youtubeVideoCheckRequestSchema>;
export type YouTubeVideoCheckResponse = z.infer<typeof youtubeVideoCheckResponseSchema>;
export type YouTubeVideoDetailResponse = z.infer<typeof youtubeVideoDetailResponseSchema>;
export type YouTubeVideoTranscriptionStartResponse = z.infer<typeof youtubeVideoTranscriptionStartResponseSchema>;
export type YouTubeVideoTranscriptResponse = z.infer<typeof youtubeVideoTranscriptResponseSchema>;
export type YouTubeVideoScreenshotsOperationResponse = z.infer<typeof youtubeVideoScreenshotsOperationResponseSchema>;
export type VideoCompressionPreset = z.infer<typeof videoCompressionPresetSchema>;
export type VideoCompressionRequest = z.infer<typeof videoCompressionRequestSchema>;
export type VideoCompressionResult = z.infer<typeof videoCompressionResultSchema>;
