import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { getJob } from './jobs.js';
import { createVideoLibraryStore } from './videoLibrary.js';
import { createVideoTranscriptionService } from './videoTranscription.js';
import type { Job, TranscriptionOptions } from './types.js';

describe('video transcription service', () => {
  it('adds YouTube URL transcriptions to the video library', async () => {
    const store = createVideoLibraryStore({ dbPath: await tempDbPath(), now: () => 1000 });
    let runnerUrl = '';
    let runnerOptions: TranscriptionOptions | null = null;

    try {
      const service = createVideoTranscriptionService({
        store,
        now: () => 1000,
        runner: async (url, options) => {
          runnerUrl = url;
          runnerOptions = options;
          return {
            rawText: 'Raw transcript',
            cleanText: 'Clean transcript',
            source: url,
            engine: 'mlx-whisper',
            screenshots: [
              {
                fileName: 'frame-0001.jpg',
                timestampSeconds: 15,
                exists: true,
                url: ''
              }
            ],
            screenshotsCount: 1
          };
        }
      });

      const started = await service.startFromUrl('https://youtu.be/auto1234567', {
        engine: 'mlx-whisper',
        screenshotsEnabled: true,
        screenshotIntervalSeconds: 15
      });

      assert.ok(started);
      assert.equal(started.video.status, 'processing');
      assert.equal(started.video.youtubeVideoId, 'auto1234567');

      const job = await waitForJob(started.jobId);
      assert.equal(job.status, 'done');

      const [video] = store.listVideos();
      assert.ok(video);
      assert.equal(video.id, started.video.id);
      assert.equal(video.status, 'done');
      assert.equal(video.cleanText, 'Clean transcript');
      assert.equal(video.rawText, 'Raw transcript');
      assert.equal(video.transcriptionJobId, started.jobId);
      assert.equal(video.screenshots[0]?.url, `/videos/library/${encodeURIComponent(video.id)}/screenshots/active/frame-0001.jpg`);
      assert.equal(runnerUrl, 'https://www.youtube.com/watch?v=auto1234567');
      assert.equal(runnerOptions?.artifactId, video.id);
      assert.equal(runnerOptions?.screenshotsEnabled, true);
      assert.equal(runnerOptions?.screenshotIntervalSeconds, 15);
    } finally {
      store.close();
    }
  });

  it('leaves non-YouTube URL transcriptions outside the video library', async () => {
    const store = createVideoLibraryStore({ dbPath: await tempDbPath() });

    try {
      const service = createVideoTranscriptionService({ store });
      const started = await service.startFromUrl('https://example.com/video', {
        screenshotsEnabled: false,
        screenshotIntervalSeconds: 30
      });

      assert.equal(started, null);
      assert.deepEqual(store.listVideos(), []);
    } finally {
      store.close();
    }
  });

  it('adds uploaded file transcriptions to the video library', async () => {
    const store = createVideoLibraryStore({ dbPath: await tempDbPath(), now: () => 2000 });
    let fileRunnerName = '';
    let fileRunnerOptions: TranscriptionOptions | null = null;

    try {
      const service = createVideoTranscriptionService({
        store,
        now: () => 2000,
        fileRunner: async (file, options) => {
          fileRunnerName = file.originalname;
          fileRunnerOptions = options;
          return {
            rawText: 'File raw transcript',
            cleanText: 'File clean transcript',
            source: file.originalname,
            engine: 'mlx-whisper'
          };
        }
      });

      const uploadedFile = {
        originalname: 'local-meeting.mp4',
        filename: 'upload-id',
        path: '/tmp/local-meeting-upload'
      } as Express.Multer.File;

      const started = await service.startFromFile(uploadedFile, {
        engine: 'mlx-whisper',
        screenshotsEnabled: false,
        screenshotIntervalSeconds: 30
      });

      assert.equal(started.video.sourceType, 'file');
      assert.equal(started.video.title, 'local-meeting.mp4');
      assert.equal(started.video.channelTitle, 'Транскрибации');
      assert.equal(started.video.originalFileName, 'local-meeting.mp4');
      assert.equal(started.video.status, 'processing');

      const job = await waitForJob(started.jobId);
      assert.equal(job.status, 'done');

      const stored = store.getVideoById(started.video.id);
      assert.ok(stored);
      assert.equal(stored.status, 'done');
      assert.equal(stored.cleanText, 'File clean transcript');
      assert.equal(stored.transcriptionJobId, started.jobId);
      assert.equal(fileRunnerName, 'local-meeting.mp4');
      assert.equal(fileRunnerOptions?.artifactId, started.video.id);
    } finally {
      store.close();
    }
  });
});

async function waitForJob(jobId: string): Promise<Job> {
  const job = getJob(jobId);
  assert.ok(job);

  while (job.status === 'running') {
    await once(job.emitter, 'event');
  }

  return job;
}

async function tempDbPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'transcribator-video-transcription-'));
  return path.join(dir, 'test.sqlite');
}
