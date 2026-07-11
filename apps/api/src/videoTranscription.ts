import type {
  TranscriptionResult,
  YouTubeVideo,
  YouTubeVideoTranscriptionRequest,
  YouTubeVideoTranscriptionStartResponse
} from '@transcribator/shared';
import { createHttpError } from './errors.js';
import { createJob, getJob } from './jobs.js';
import { getSavedSourcePathForUpload, transcribeFile, transcribeSavedFile, transcribeUrl } from './pipeline.js';
import { defaultVideoLibraryStore, extractYouTubeVideoId, type VideoLibraryStore } from './videoLibrary.js';
import type { JobTaskContext, ProgressHandler, TranscriptionOptions } from './types.js';

export type VideoTranscriptionRunner = (url: string, options: TranscriptionOptions) => Promise<TranscriptionResult>;
export type FileTranscriptionRunner = (file: Express.Multer.File, options: TranscriptionOptions) => Promise<TranscriptionResult>;
export type SavedFileTranscriptionRunner = (
  sourcePath: string,
  originalName: string,
  options: TranscriptionOptions
) => Promise<TranscriptionResult>;

export interface VideoTranscriptionServiceOptions {
  store?: VideoLibraryStore | undefined;
  runner?: VideoTranscriptionRunner | undefined;
  fileRunner?: FileTranscriptionRunner | undefined;
  savedFileRunner?: SavedFileTranscriptionRunner | undefined;
  now?: (() => number) | undefined;
}

export interface VideoTranscriptionService {
  start(id: string, input: YouTubeVideoTranscriptionRequest): Promise<YouTubeVideoTranscriptionStartResponse>;
  startFromUrl(url: string, input: YouTubeVideoTranscriptionRequest): Promise<YouTubeVideoTranscriptionStartResponse | null>;
  startFromFile(file: Express.Multer.File | undefined, input: YouTubeVideoTranscriptionRequest): Promise<YouTubeVideoTranscriptionStartResponse>;
}

export const videoTranscriptionService = createVideoTranscriptionService({
  store: defaultVideoLibraryStore,
  runner: transcribeUrl
});

export function createVideoTranscriptionService(options: VideoTranscriptionServiceOptions = {}): VideoTranscriptionService {
  const store = options.store || defaultVideoLibraryStore;
  const runner = options.runner || transcribeUrl;
  const fileRunner = options.fileRunner || transcribeFile;
  const savedFileRunner = options.savedFileRunner || transcribeSavedFile;
  const now = options.now || Date.now;

  const startVideoJob = (
    video: YouTubeVideo,
    input: YouTubeVideoTranscriptionRequest,
    task: (options: TranscriptionOptions, onProgress: ProgressHandler, context: JobTaskContext) => Promise<TranscriptionResult>
  ) => {
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
          const result = await task({
            engine: input.engine,
            screenshotsEnabled: input.screenshotsEnabled,
            screenshotIntervalSeconds: input.screenshotIntervalSeconds,
            jobId: context.jobId,
            artifactId: video.id,
            startedAt: context.startedAt,
            onProgress
          }, onProgress, context);
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
        sourceType: video.sourceType === 'file' ? 'file' : 'url',
        source: video.sourceType === 'file' ? video.originalFileName || video.sourcePath || video.title : video.url,
        ...(input.engine ? { engine: input.engine } : {})
      }
    );

    const updated = store.markTranscriptionProcessing(video.id, {
      jobId: job.id,
      engine: input.engine,
      startedAt
    });

    return { video: updated, jobId: job.id };
  };

  return {
    async start(id, input) {
      const video = store.getVideoById(id);
      if (!video) {
        throw createHttpError(404, 'Видео не найдено.');
      }

      if (video.sourceType === 'file') {
        if (!video.sourcePath) {
          throw createHttpError(400, 'У локального видео нет сохраненного исходного файла.');
        }

        return startVideoJob(video, input, (transcriptionOptions) =>
          savedFileRunner(video.sourcePath, video.originalFileName || video.title, transcriptionOptions)
        );
      }

      return startVideoJob(video, input, (transcriptionOptions) => runner(video.url, transcriptionOptions));
    },

    async startFromUrl(url, input) {
      if (!extractYouTubeVideoId(url)) {
        return null;
      }

      const { video } = store.addVideo({ url });
      return startVideoJob(video, input, (transcriptionOptions) => runner(video.url, transcriptionOptions));
    },

    async startFromFile(file, input) {
      if (!file) {
        throw createHttpError(400, 'Выберите аудио или видеофайл.');
      }

      const { safeOriginalName, savedSourcePath } = getSavedSourcePathForUpload(file);
      const { video } = store.addLocalFile({
        originalFileName: file.originalname || safeOriginalName,
        sourcePath: savedSourcePath,
        title: file.originalname || safeOriginalName
      });

      return startVideoJob(video, input, (transcriptionOptions) => fileRunner(file, transcriptionOptions));
    }
  };
}
