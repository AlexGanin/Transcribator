import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { ensureRuntimeDirs, transcribeFile, transcribeUrl } from './pipeline.js';
import { createJob, getJob, listHistory } from './jobs.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const uploadDir = path.resolve(process.cwd(), '..', 'tmp', 'uploads');
const maxUploadSizeGb = parsePositiveNumberEnv('MAX_UPLOAD_SIZE_GB', 10);
const maxUploadSizeBytes = Math.floor(maxUploadSizeGb * 1024 ** 3);

await ensureRuntimeDirs();
await mkdir(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: maxUploadSizeBytes
  }
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/transcribe/url', async (req, res, next) => {
  try {
    const job = createJob(
      (onProgress) => transcribeUrl(req.body?.url, { engine: req.body?.engine, onProgress }),
      { sourceType: 'url', source: req.body?.url, engine: req.body?.engine }
    );
    res.status(202).json({ jobId: job.id });
  } catch (error) {
    next(error);
  }
});

app.post('/transcribe/file', upload.single('file'), async (req, res, next) => {
  try {
    const job = createJob(
      (onProgress) => transcribeFile(req.file, { engine: req.body?.engine, onProgress }),
      { sourceType: 'file', source: req.file?.originalname, engine: req.body?.engine }
    );
    res.status(202).json({ jobId: job.id });
  } catch (error) {
    next(error);
  }
});

app.get('/transcribe/history', async (req, res, next) => {
  try {
    res.json({ history: await listHistory() });
  } catch (error) {
    next(error);
  }
});

app.get('/transcribe/jobs/:id/events', (req, res) => {
  const job = getJob(req.params.id);

  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  for (const event of job.events) {
    send(event);
  }

  if (job.status === 'done' || job.status === 'error') {
    res.end();
    return;
  }

  const onEvent = (event) => {
    send(event);
    if (event.type === 'done' || event.type === 'error') {
      job.emitter.off('event', onEvent);
      res.end();
    }
  };

  job.emitter.on('event', onEvent);
  req.on('close', () => job.emitter.off('event', onEvent));
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: `File too large. Max upload size is ${formatBytes(maxUploadSizeBytes)}.`
    });
    return;
  }

  console.error(error);
  res.status(error.statusCode || 500).json({
    error: error.message || 'Unexpected server error.'
  });
});

app.listen(port, host, () => {
  console.log(`Transcribator server is running on http://${host}:${port}`);
  console.log(`Max upload size is ${formatBytes(maxUploadSizeBytes)}.`);
});

function parsePositiveNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatBytes(bytes) {
  const gb = bytes / 1024 ** 3;
  return `${Number(gb.toFixed(2))} GiB`;
}
