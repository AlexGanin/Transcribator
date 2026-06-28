import type { ZodType } from 'zod';
import {
  apiErrorSchema,
  healthResponseSchema,
  jobIdResponseSchema,
  updateYouTubeVideoTranscriptRequestSchema,
  youtubeVideoAddResponseSchema,
  youtubeVideoCheckResponseSchema,
  youtubeVideoCreateRequestSchema,
  youtubeVideoDetailResponseSchema,
  youtubeVideoListResponseSchema,
  youtubeVideoScreenshotsOperationResponseSchema,
  youtubeVideoTranscriptResponseSchema,
  youtubeVideoTranscriptionRequestSchema,
  youtubeVideoTranscriptionStartResponseSchema,
  videoCompressionPresetSchema,
  videoDownloadResponseSchema,
  videoFormatsResponseSchema,
  videoScreenshotsRequestSchema,
  type ApiError,
  type HealthResponse,
  type JobIdResponse,
  type TranscriptionArtifactOptions,
  type TranscriptionEngine,
  type UpdateYouTubeVideoTranscriptRequest,
  type VideoCompressionPreset,
  type VideoDownloadResponse,
  type VideoFormatsResponse,
  type VideoScreenshotScope,
  type YouTubeVideoAddResponse,
  type YouTubeVideoCheckResponse,
  type YouTubeVideoCreateRequest,
  type YouTubeVideoDetailResponse,
  type YouTubeVideoListResponse,
  type YouTubeVideoScreenshotsOperationResponse,
  type YouTubeVideoTranscriptResponse,
  type YouTubeVideoTranscriptionRequest,
  type YouTubeVideoTranscriptionStartResponse
} from '@transcribator/shared';

export type FetchLike = typeof fetch;

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly details: ApiError;

  constructor(status: number, details: ApiError) {
    super(details.error);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || 'http://127.0.0.1:2001');
  const fetcher = options.fetchImpl || fetch;

  return {
    health: () => requestJson<HealthResponse>(fetcher, baseUrl, '/health', {}, healthResponseSchema),

    transcribeUrl: (url: string, engine?: TranscriptionEngine, artifactOptions: Partial<TranscriptionArtifactOptions> = {}) =>
      requestJson<JobIdResponse>(
        fetcher,
        baseUrl,
        '/transcribe/url',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, engine, ...artifactOptions })
        },
        jobIdResponseSchema
      ),

    transcribeFile: (file: File, engine?: TranscriptionEngine, artifactOptions: Partial<TranscriptionArtifactOptions> = {}) => {
      const body = new FormData();
      body.append('file', file);
      if (engine) {
        body.append('engine', engine);
      }
      if (artifactOptions.screenshotsEnabled !== undefined) {
        body.append('screenshotsEnabled', String(artifactOptions.screenshotsEnabled));
      }
      if (artifactOptions.screenshotIntervalSeconds !== undefined) {
        body.append('screenshotIntervalSeconds', String(artifactOptions.screenshotIntervalSeconds));
      }

      return requestJson<JobIdResponse>(
        fetcher,
        baseUrl,
        '/transcribe/file',
        { method: 'POST', body },
        jobIdResponseSchema
      );
    },

    getVideoFormats: (url: string) =>
      requestJson<VideoFormatsResponse>(
        fetcher,
        baseUrl,
        '/videos/formats',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        },
        videoFormatsResponseSchema
      ),

    downloadVideo: (url: string, formatId: string) =>
      requestJson<VideoDownloadResponse>(
        fetcher,
        baseUrl,
        '/videos/download',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, formatId })
        },
        videoDownloadResponseSchema
      ),

    getYouTubeVideos: () =>
      requestJson<YouTubeVideoListResponse>(
        fetcher,
        baseUrl,
        '/videos/library',
        {},
        youtubeVideoListResponseSchema
      ),

    addYouTubeVideo: (input: YouTubeVideoCreateRequest) =>
      requestJson<YouTubeVideoAddResponse>(
        fetcher,
        baseUrl,
        '/videos/library',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(youtubeVideoCreateRequestSchema.parse(input))
        },
        youtubeVideoAddResponseSchema
      ),

    checkYouTubeVideo: (url: string) =>
      requestJson<YouTubeVideoCheckResponse>(
        fetcher,
        baseUrl,
        `/videos/library/check?url=${encodeURIComponent(url)}`,
        {},
        youtubeVideoCheckResponseSchema
      ),

    getYouTubeVideo: (id: string) =>
      requestJson<YouTubeVideoDetailResponse>(
        fetcher,
        baseUrl,
        `/videos/library/${encodeURIComponent(id)}`,
        {},
        youtubeVideoDetailResponseSchema
      ),

    refreshYouTubeVideoMetadata: (id: string) =>
      requestJson<YouTubeVideoDetailResponse>(
        fetcher,
        baseUrl,
        `/videos/library/${encodeURIComponent(id)}/metadata`,
        { method: 'POST' },
        youtubeVideoDetailResponseSchema
      ),

    transcribeYouTubeVideo: (id: string, input: Partial<YouTubeVideoTranscriptionRequest> = {}) =>
      requestJson<YouTubeVideoTranscriptionStartResponse>(
        fetcher,
        baseUrl,
        `/videos/library/${encodeURIComponent(id)}/transcribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(youtubeVideoTranscriptionRequestSchema.parse(input))
        },
        youtubeVideoTranscriptionStartResponseSchema
      ),

    updateYouTubeVideoTranscript: (id: string, patch: UpdateYouTubeVideoTranscriptRequest) =>
      requestJson<YouTubeVideoTranscriptResponse>(
        fetcher,
        baseUrl,
        `/videos/library/${encodeURIComponent(id)}/transcript`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateYouTubeVideoTranscriptRequestSchema.parse(patch))
        },
        youtubeVideoTranscriptResponseSchema
      ),

    formatYouTubeVideoTranscript: (id: string) =>
      requestJson<YouTubeVideoTranscriptResponse>(
        fetcher,
        baseUrl,
        `/videos/library/${encodeURIComponent(id)}/format`,
        { method: 'POST' },
        youtubeVideoTranscriptResponseSchema
      ),

    createYouTubeVideoMarkdown: (id: string) =>
      requestJson<YouTubeVideoTranscriptResponse>(
        fetcher,
        baseUrl,
        `/videos/library/${encodeURIComponent(id)}/markdown`,
        { method: 'POST' },
        youtubeVideoTranscriptResponseSchema
      ),

    trashYouTubeVideoScreenshots: (id: string, fileNames: string[]) =>
      requestJson<YouTubeVideoScreenshotsOperationResponse>(
        fetcher,
        baseUrl,
        `/videos/library/${encodeURIComponent(id)}/screenshots/trash`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(videoScreenshotsRequestSchema.parse({ fileNames }))
        },
        youtubeVideoScreenshotsOperationResponseSchema
      ),

    restoreYouTubeVideoScreenshots: (id: string, fileNames: string[]) =>
      requestJson<YouTubeVideoScreenshotsOperationResponse>(
        fetcher,
        baseUrl,
        `/videos/library/${encodeURIComponent(id)}/screenshots/restore`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(videoScreenshotsRequestSchema.parse({ fileNames }))
        },
        youtubeVideoScreenshotsOperationResponseSchema
      ),

    clearYouTubeVideoScreenshotsTrash: (id: string) =>
      requestJson<YouTubeVideoScreenshotsOperationResponse>(
        fetcher,
        baseUrl,
        `/videos/library/${encodeURIComponent(id)}/screenshots/trash`,
        { method: 'DELETE' },
        youtubeVideoScreenshotsOperationResponseSchema
      ),

    youTubeVideoScreenshotUrl: (id: string, scope: VideoScreenshotScope, fileName: string) =>
      `${baseUrl}/videos/library/${encodeURIComponent(id)}/screenshots/${scope}/${encodeURIComponent(fileName)}`,

    compressVideo: (file: File, preset: VideoCompressionPreset = 'balanced') => {
      const body = new FormData();
      body.append('file', file);
      body.append('preset', videoCompressionPresetSchema.parse(preset));

      return requestJson<JobIdResponse>(
        fetcher,
        baseUrl,
        '/videos/compress',
        { method: 'POST', body },
        jobIdResponseSchema
      );
    },

    jobEventsUrl: (jobId: string) => `${baseUrl}/jobs/${encodeURIComponent(jobId)}/events`
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

async function requestJson<T>(
  fetcher: FetchLike,
  baseUrl: string,
  path: string,
  init: RequestInit,
  schema: ZodType<T>
): Promise<T> {
  const response = await fetcher(`${baseUrl}${path}`, init);
  const payload = await readJson(response);

  if (!response.ok) {
    const details = apiErrorSchema.safeParse(payload).success
      ? apiErrorSchema.parse(payload)
      : { error: response.statusText || 'Request failed.' };
    throw new ApiClientError(response.status, details);
  }

  return schema.parse(payload);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}
