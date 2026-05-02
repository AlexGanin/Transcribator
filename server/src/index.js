import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { ensureRuntimeDirs, transcribeFile, transcribeUrl } from './pipeline.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const uploadDir = path.resolve(process.cwd(), '..', 'tmp', 'uploads');

await ensureRuntimeDirs();
await mkdir(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 1024 * 1024 * 1024
  }
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/transcribe/url', async (req, res, next) => {
  try {
    const result = await transcribeUrl(req.body?.url);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/transcribe/file', upload.single('file'), async (req, res, next) => {
  try {
    const result = await transcribeFile(req.file);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
    error: error.message || 'Unexpected server error.'
  });
});

app.listen(port, host, () => {
  console.log(`Transcribator server is running on http://${host}:${port}`);
});
