import type {
  TranscriptionResult,
  YouTubeVideoTranscriptionRequest,
  YouTubeVideoTranscriptionStartResponse
} from '@transcribator/shared';
import { createHttpError } from './errors.js';
import { createJob, getJob } from './jobs.js';
import { transcribeUrl } from './pipeline.js';
import { defaultVideoLibraryStore, type VideoLibraryStore } from './videoLibrary.js';
import type { TranscriptionOptions } from './types.js';

export type VideoTranscriptionRunner = (url: string, options: TranscriptionOptions) => Promise<TranscriptionResult>;

export interface VideoTranscriptionServiceOptions {
  store?: VideoLibraryStore | undefined;
  runner?: VideoTranscriptionRunner | undefined;
  now?: (() => number) | undefined;
}

export interface VideoTranscriptionService {
  start(id: string, input: YouTubeVideoTranscriptionRequest): Promise<YouTubeVideoTranscriptionStartResponse>;
}

export const videoTranscriptionService = createVideoTranscriptionService({
  store: defaultVideoLibraryStore,
  runner: transcribeUrl
});

export function createVideoTranscriptionService(options: VideoTranscriptionServiceOptions = {}): VideoTranscriptionService {
  const store = options.store || defaultVideoLibraryStore;
  const runner = options.runner || transcribeUrl;
  const now = options.now || Date.now;

  return {
    async start(id, input) {
      const video = store.getVideoById(id);
      if (!video) {
        throw createHttpError(404, 'Видео не найдено.');
      }

      if (video.status === 'processing' && video.transcriptionJobId) {
        const job = getJob(video.transcriptionJobId);
        if (job?.status === 'running') {
          return { video, jobId: video.transcriptionJobId };
        }
      }

      const startedAt = now();
      const job = createJob(
        async (onProgress, context) => {
          try {
            const result = await runner(video.url, {
              engine: input.engine,
              screenshotsEnabled: input.screenshotsEnabled,
              screenshotIntervalSeconds: input.screenshotIntervalSeconds,
              jobId: context.jobId,
              artifactId: video.id,
              startedAt: context.startedAt,
              onProgress
            });
            store.saveTranscriptionResult(video.id, {
              jobId: context.jobId,
              result,
              finishedAt: now()
            });
            return result;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось транскрибировать видео.';
            store.saveTranscriptionError(video.id, {
              jobId: context.jobId,
              error: message,
              finishedAt: now()
            });
            throw error;
          }
        },
        {
          sourceType: 'url',
          source: video.url,
          ...(input.engine ? { engine: input.engine } : {})
        }
      );

      const updated = store.markTranscriptionProcessing(video.id, {
        jobId: job.id,
        engine: input.engine,
        startedAt
      });

      return { video: updated, jobId: job.id };
    }
  };
}
