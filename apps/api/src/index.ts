import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import {
  fileTranscriptionRequestSchema,
  historyScreenshotScopeSchema,
  historyScreenshotsRequestSchema,
  screenshotFileNameSchema,
  updateHistoryEntryRequestSchema,
  urlTranscriptionRequestSchema,
  videoCompressionRequestSchema,
  videoDownloadRequestSchema,
  videoFormatsRequestSchema
} from '@transcribator/shared';
import { ensureRuntimeDirs, transcribeFile, transcribeUrl } from './pipeline.js';
import { createJob, getJob, listHistory } from './jobs.js';
import { historyDetailsService } from './historyDetails.js';
import { defaultTranscriptionStore, migrateHistoryJsonToSqlite } from './transcriptionStore.js';
import { compressVideo, ensureCompressedDir } from './videoCompression.js';
import { downloadVideo, ensureDownloadDir, getVideoFormats } from './videoDownload.js';
import { createHttpError, isHttpError } from './errors.js';
import type { JobMetadata } from './types.js';
import type { ProgressEvent, TranscriptionEngine } from '@transcribator/shared';

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const uploadDir = path.resolve(process.cwd(), '../..', 'runtime', 'tmp', 'uploads');
const maxUploadSizeGb = parsePositiveNumberEnv('MAX_UPLOAD_SIZE_GB', 10);
const maxUploadSizeBytes = Math.floor(maxUploadSizeGb * 1024 ** 3);

await ensureRuntimeDirs();
await ensureDownloadDir();
await ensureCompressedDir();
await migrateHistoryJsonToSqlite({ store: defaultTranscriptionStore });
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
    const job = createJob(
      (onProgress, context) => transcribeFile(req.file, {
        engine: body.engine,
        screenshotsEnabled: body.screenshotsEnabled,
        screenshotIntervalSeconds: body.screenshotIntervalSeconds,
        jobId: context.jobId,
        startedAt: context.startedAt,
        onProgress
      }),
      buildJobMetadata('file', req.file?.originalname, body.engine)
    );
    res.status(202).json({ jobId: job.id });
  } catch (error) {
    next(error);
  }
});

app.get('/transcribe/history', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ history: await listHistory() });
  } catch (error) {
    next(error);
  }
});

app.get('/transcribe/history/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    res.json(await historyDetailsService.get(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.patch('/transcribe/history/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const body = updateHistoryEntryRequestSchema.parse(req.body || {});
    res.json(await historyDetailsService.update(req.params.id, body));
  } catch (error) {
    next(error);
  }
});

app.delete('/transcribe/history/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    res.json(await historyDetailsService.deleteEntry(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.post('/transcribe/history/:id/format', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    res.json(await historyDetailsService.formatWithAi(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.post('/transcribe/history/:id/markdown', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    res.json(await historyDetailsService.createMarkdown(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.post('/transcribe/history/:id/screenshots/trash', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const body = historyScreenshotsRequestSchema.parse(req.body || {});
    res.json(await historyDetailsService.trashScreenshots(req.params.id, body));
  } catch (error) {
    next(error);
  }
});

app.post('/transcribe/history/:id/screenshots/restore', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const body = historyScreenshotsRequestSchema.parse(req.body || {});
    res.json(await historyDetailsService.restoreScreenshots(req.params.id, body));
  } catch (error) {
    next(error);
  }
});

app.delete('/transcribe/history/:id/screenshots/trash', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    res.json(await historyDetailsService.clearScreenshotsTrash(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.get(
  '/transcribe/history/:id/screenshots/:scope/:fileName',
  async (req: Request<{ id: string; scope: string; fileName: string }>, res: Response, next: NextFunction) => {
    try {
      const scope = historyScreenshotScopeSchema.parse(req.params.scope);
      const fileName = screenshotFileNameSchema.parse(req.params.fileName);
      res.type('image/jpeg');
      res.sendFile(await historyDetailsService.getScreenshotPath(req.params.id, scope, fileName));
    } catch (error) {
      next(error);
    }
  }
);

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
      },
      { persistHistory: false }
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

function parsePositiveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return `${Number(gb.toFixed(2))} GiB`;
}

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
