import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import {
  fileTranscriptionRequestSchema,
  screenshotFileNameSchema,
  updateYouTubeVideoTranscriptRequestSchema,
  urlTranscriptionRequestSchema,
  videoCompressionRequestSchema,
  videoDownloadRequestSchema,
  videoFormatsRequestSchema,
  videoScreenshotScopeSchema,
  videoScreenshotsRequestSchema,
  youtubeVideoCheckRequestSchema,
  youtubeVideoCreateRequestSchema,
  youtubeVideoTranscriptionRequestSchema
} from '@transcribator/shared';
import { ensureRuntimeDirs, transcribeUrl } from './pipeline.js';
import { createJob, getJob } from './jobs.js';
import { compressVideo, ensureCompressedDir } from './videoCompression.js';
import { downloadVideo, ensureDownloadDir, getVideoFormats } from './videoDownload.js';
import { defaultVideoLibraryStore } from './videoLibrary.js';
import { videoArtifactsService } from './videoArtifacts.js';
import { videoTranscriptionService } from './videoTranscription.js';
import { createHttpError, isHttpError } from './errors.js';
import { formatBytes, getMaxUploadSizeBytes } from './uploadLimit.js';
import type { JobMetadata } from './types.js';
import type { ProgressEvent, TranscriptionEngine } from '@transcribator/shared';

const app = express();
const port = Number(process.env.PORT || 2001);
const host = process.env.HOST || '127.0.0.1';
const uploadDir = path.resolve(process.cwd(), '../..', 'runtime', 'tmp', 'uploads');
const maxUploadSizeBytes = getMaxUploadSizeBytes();

await ensureRuntimeDirs();
await ensureDownloadDir();
await ensureCompressedDir();
await mkdir(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: maxUploadSizeBytes
  }
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post('/transcribe/url', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = urlTranscriptionRequestSchema.parse(req.body || {});
    const libraryJob = await videoTranscriptionService.startFromUrl(body.url, body);
    if (libraryJob) {
      res.status(202).json({ jobId: libraryJob.jobId });
      return;
    }

    const job = createJob(
      (onProgress, context) => transcribeUrl(body.url, {
        engine: body.engine,
        screenshotsEnabled: body.screenshotsEnabled,
        screenshotIntervalSeconds: body.screenshotIntervalSeconds,
        jobId: context.jobId,
        startedAt: context.startedAt,
        onProgress
      }),
      buildJobMetadata('url', body.url, body.engine)
    );
    res.status(202).json({ jobId: job.id });
  } catch (error) {
    next(error);
  }
});

app.post('/transcribe/file', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = fileTranscriptionRequestSchema.parse(req.body || {});
    const libraryJob = await videoTranscriptionService.startFromFile(req.file, body);
    res.status(202).json({ jobId: libraryJob.jobId });
  } catch (error) {
    next(error);
  }
});

app.post('/videos/formats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = videoFormatsRequestSchema.parse(req.body || {});
    res.json(await getVideoFormats(body.url));
  } catch (error) {
    next(error);
  }
});

app.post('/videos/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = videoDownloadRequestSchema.parse(req.body || {});
    res.status(202).json(await downloadVideo(body.url, body.formatId));
  } catch (error) {
    next(error);
  }
});

app.get('/videos/library', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ videos: await defaultVideoLibraryStore.listVideosWithMetadata() });
  } catch (error) {
    next(error);
  }
});

app.get('/videos/library/check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = youtubeVideoCheckRequestSchema.parse(req.query || {});
    res.json(defaultVideoLibraryStore.checkVideo(query.url));
  } catch (error) {
    next(error);
  }
});

app.get('/videos/library/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await defaultVideoLibraryStore.getVideoDetail(String(req.params.id || '')));
  } catch (error) {
    next(error);
  }
});

app.delete('/videos/library/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    res.json(await videoArtifactsService.deleteVideo(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.post('/videos/library/:id/metadata', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await defaultVideoLibraryStore.getVideoDetail(String(req.params.id || ''), { refresh: true }));
  } catch (error) {
    next(error);
  }
});

app.post('/videos/library/:id/transcribe', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const body = youtubeVideoTranscriptionRequestSchema.parse(req.body || {});
    res.status(202).json(await videoTranscriptionService.start(req.params.id, body));
  } catch (error) {
    next(error);
  }
});

app.patch('/videos/library/:id/transcript', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const body = updateYouTubeVideoTranscriptRequestSchema.parse(req.body || {});
    res.json(await videoArtifactsService.updateTranscript(req.params.id, body));
  } catch (error) {
    next(error);
  }
});

app.post('/videos/library/:id/format', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    res.json(await videoArtifactsService.formatWithAi(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.post('/videos/library/:id/markdown', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    res.json(await videoArtifactsService.createMarkdown(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.post('/videos/library/:id/thumbnail', upload.single('file'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    res.json(await videoArtifactsService.updateThumbnail(req.params.id, req.file));
  } catch (error) {
    if (req.file?.path) {
      await rm(req.file.path, { force: true });
    }
    next(error);
  }
});

app.get(
  '/videos/library/:id/thumbnail/:fileName',
  async (req: Request<{ id: string; fileName: string }>, res: Response, next: NextFunction) => {
    try {
      const extension = path.extname(req.params.fileName).toLowerCase();
      res.type(extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg');
      res.sendFile(await videoArtifactsService.getThumbnailPath(req.params.id, req.params.fileName));
    } catch (error) {
      next(error);
    }
  }
);

app.post('/videos/library/:id/screenshots/trash', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const body = videoScreenshotsRequestSchema.parse(req.body || {});
    res.json(await videoArtifactsService.trashScreenshots(req.params.id, body));
  } catch (error) {
    next(error);
  }
});

app.post('/videos/library/:id/screenshots/restore', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const body = videoScreenshotsRequestSchema.parse(req.body || {});
    res.json(await videoArtifactsService.restoreScreenshots(req.params.id, body));
  } catch (error) {
    next(error);
  }
});

app.delete('/videos/library/:id/screenshots/trash', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    res.json(await videoArtifactsService.clearScreenshotsTrash(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.get(
  '/videos/library/:id/screenshots/:scope/:fileName',
  async (req: Request<{ id: string; scope: string; fileName: string }>, res: Response, next: NextFunction) => {
    try {
      const scope = videoScreenshotScopeSchema.parse(req.params.scope);
      const fileName = screenshotFileNameSchema.parse(req.params.fileName);
      res.type('image/jpeg');
      res.sendFile(await videoArtifactsService.getScreenshotPath(req.params.id, scope, fileName));
    } catch (error) {
      next(error);
    }
  }
);

app.post('/videos/library', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = youtubeVideoCreateRequestSchema.parse(req.body || {});
    res.status(201).json(await defaultVideoLibraryStore.addVideoWithMetadata(body));
  } catch (error) {
    next(error);
  }
});

app.post('/videos/compress', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = videoCompressionRequestSchema.parse(req.body || {});
    const uploadedFile = req.file;

    if (!uploadedFile) {
      throw createHttpError(400, 'Выберите видеофайл для сжатия.');
    }

    const job = createJob(
      (onProgress) => compressVideo(uploadedFile, { preset: body.preset, onProgress }),
      {
        sourceType: 'video-compression',
        ...(uploadedFile.originalname ? { source: uploadedFile.originalname } : {}),
        preset: body.preset
      }
    );
    res.status(202).json({ jobId: job.id });
  } catch (error) {
    if (req.file?.path) {
      await rm(req.file.path, { force: true });
    }
    next(error);
  }
});

function handleJobEvents(req: Request<{ id: string }>, res: Response): void {
  const job = getJob(req.params.id);

  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: ProgressEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  for (const event of job.events) {
    send(event);
  }

  if (job.status === 'done' || job.status === 'error') {
    res.end();
    return;
  }

  const onEvent = (event: ProgressEvent): void => {
    send(event);
    if (event.type === 'done' || event.type === 'error') {
      job.emitter.off('event', onEvent);
      res.end();
    }
  };

  job.emitter.on('event', onEvent);
  req.on('close', () => job.emitter.off('event', onEvent));
}

app.get('/jobs/:id/events', handleJobEvents);
app.get('/transcribe/jobs/:id/events', handleJobEvents);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: `File too large. Max upload size is ${formatBytes(maxUploadSizeBytes)}.`
    });
    return;
  }

  if (isZodValidationError(error)) {
    res.status(400).json({ error: formatValidationError(error) });
    return;
  }

  console.error(error);
  res.status(isHttpError(error) ? error.statusCode : 500).json({
    error: error instanceof Error ? error.message : 'Unexpected server error.'
  });
});

app.listen(port, host, () => {
  console.log(`Transcribator server is running on http://${host}:${port}`);
  console.log(`Max upload size is ${formatBytes(maxUploadSizeBytes)}.`);
});

interface ZodIssueLike {
  path?: PropertyKey[] | undefined;
  message: string;
}

interface ZodValidationErrorLike {
  issues: ZodIssueLike[];
}

function isZodValidationError(error: unknown): error is ZodValidationErrorLike {
  return Boolean(
    error &&
      typeof error === 'object' &&
      Array.isArray((error as { issues?: unknown }).issues)
  );
}

function formatValidationError(error: ZodValidationErrorLike): string {
  const firstIssue = error.issues?.[0];
  if (!firstIssue) return 'Invalid request.';
  const pathLabel = firstIssue.path?.length ? `${firstIssue.path.join('.')}: ` : '';
  return `${pathLabel}${firstIssue.message}`;
}

function buildJobMetadata(
  sourceType: 'url' | 'file',
  source: string | undefined,
  engine: TranscriptionEngine | undefined
): JobMetadata {
  return {
    sourceType,
    ...(source ? { source } : {}),
    ...(engine ? { engine } : {})
  };
}
