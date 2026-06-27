# Unified Video Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/videos` the primary workflow where each YouTube video stores metadata, transcription result, markdown, screenshots, and status in the single `youtube_videos` SQLite table while removing the separate History feature.

**Architecture:** Keep Express API as the owner of media work. Extend `youtube_videos` into the single persisted user table, move history-detail operations to video-detail operations, and run YouTube transcription jobs with `persistHistory: false` while explicitly saving job output back into the video row. CRM keeps the transient root transcriber, but saved YouTube work happens only through `/videos`.

**Tech Stack:** TypeScript, Express, Node SQLite `DatabaseSync`, Next.js App Router, React, Zod contracts in `packages/shared`, fetch client in `packages/api-client`, Node test runner with `tsx`.

---

## File Structure

- Modify `packages/shared/src/index.ts`: remove public history contracts after replacement, add video transcript/screenshot contracts.
- Modify `packages/api-client/src/index.ts`: remove history client methods after replacement, add video transcription/transcript/markdown/screenshot methods.
- Modify `packages/api-client/src/index.test.ts`: cover new video API client methods.
- Modify `apps/api/src/videoLibrary.ts`: extend `youtube_videos`, add transcript/screenshot persistence methods, drop legacy history tables.
- Modify `apps/api/src/videoLibrary.test.ts`: cover schema cleanup, transcript persistence, screenshot JSON operations, processing lock.
- Create `apps/api/src/videoTranscription.ts`: start a video transcription job and save result/error into `youtube_videos`.
- Create `apps/api/src/videoTranscription.test.ts`: cover done/error transitions using a fake runner.
- Create `apps/api/src/videoArtifacts.ts`: video markdown and screenshot trash/restore/clear/file-path operations using JSON fields.
- Create `apps/api/src/videoArtifacts.test.ts`: cover markdown output and screenshot file moves.
- Modify `apps/api/src/jobs.ts`: remove history persistence responsibility.
- Modify `apps/api/src/index.ts`: remove history routes/imports/migration; add video routes.
- Modify `apps/crm/src/components/crm-navigation.ts`: remove `history` view and `buildHistoryDetailPath`.
- Modify `apps/crm/src/components/crm-navigation.test.ts`: assert no History menu item.
- Modify `apps/crm/src/components/transcribator-app.tsx`: remove history UI state/routes; add video transcription actions and video transcript detail UI.
- Create `apps/crm/src/components/video-transcript.ts`: focused helpers for transcript display/edit labels.
- Create `apps/crm/src/components/video-transcript.test.ts`: test helper behavior.
- Rename or replace `apps/crm/src/components/history-lightbox-navigation.ts` with `apps/crm/src/components/screenshot-lightbox-navigation.ts`.
- Rename or replace `apps/crm/src/components/history-lightbox-navigation.test.ts` with `apps/crm/src/components/screenshot-lightbox-navigation.test.ts`.
- Delete `apps/crm/app/history/page.tsx` and `apps/crm/app/history/[id]/page.tsx`.
- Delete obsolete history-only files after replacements: `apps/crm/src/components/history-delete.ts`, `apps/crm/src/components/history-delete.test.ts`, `apps/api/src/historyDetails.ts`, `apps/api/src/historyDetails.test.ts`, `apps/api/src/markdownArtifacts.ts`, `apps/api/src/markdownArtifacts.test.ts`, `apps/api/src/transcriptionStore.ts`, `apps/api/src/transcriptionStore.test.ts`, `apps/api/src/transcriptPersistence.ts`, `apps/api/src/transcriptPersistence.test.ts` if no imports remain.
- Modify `docs/agent/PROJECT_MAP.md`, `docs/agent/INFRASTRUCTURE.md`, `docs/agent/CHANGELOG.md`: document the new model.
- Modify `README.md`: update user-facing workflow.

---

### Task 1: Shared Contracts For Video Transcript State

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test through: `pnpm --filter @transcribator/shared check`

- [ ] **Step 1: Write the desired contract shape**

In `packages/shared/src/index.ts`, replace history-specific public schemas with video-specific schemas while keeping existing transcription request/result schemas. The target code shape is:

```ts
export const videoScreenshotScopeSchema = z.enum(['active', 'trash']);

export const videoScreenshotSchema = z.object({
  fileName: screenshotFileNameSchema,
  timestampSeconds: z.number().nonnegative().default(0),
  exists: z.boolean(),
  url: z.string().default('')
});

export const videoScreenshotsRequestSchema = z.object({
  fileNames: z.array(screenshotFileNameSchema).min(1)
}).strict();

export const updateYouTubeVideoTranscriptRequestSchema = z.object({
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
```

- [ ] **Step 2: Extend `youtubeVideoSchema`**

Add the transcript fields directly to `youtubeVideoSchema`:

```ts
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
trashedScreenshots: z.array(videoScreenshotSchema).default([])
```

- [ ] **Step 3: Add response schemas**

Add these schemas after `youtubeVideoDetailResponseSchema`:

```ts
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
```

- [ ] **Step 4: Export types**

Export:

```ts
export type VideoScreenshotScope = z.infer<typeof videoScreenshotScopeSchema>;
export type VideoScreenshot = z.infer<typeof videoScreenshotSchema>;
export type VideoScreenshotsRequest = z.infer<typeof videoScreenshotsRequestSchema>;
export type UpdateYouTubeVideoTranscriptRequest = z.infer<typeof updateYouTubeVideoTranscriptRequestSchema>;
export type YouTubeVideoTranscriptionRequest = z.infer<typeof youtubeVideoTranscriptionRequestSchema>;
export type YouTubeVideoTranscriptionStartResponse = z.infer<typeof youtubeVideoTranscriptionStartResponseSchema>;
export type YouTubeVideoTranscriptResponse = z.infer<typeof youtubeVideoTranscriptResponseSchema>;
export type YouTubeVideoScreenshotsOperationResponse = z.infer<typeof youtubeVideoScreenshotsOperationResponseSchema>;
```

- [ ] **Step 5: Run shared check**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/shared check
```

Expected: TypeScript build exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "main. Обновить контракты видео-транскрибации"
```

---

### Task 2: API Client Methods For Video Workflow

**Files:**
- Modify: `packages/api-client/src/index.ts`
- Modify: `packages/api-client/src/index.test.ts`

- [ ] **Step 1: Add failing API client tests**

Append tests to `packages/api-client/src/index.test.ts`:

```ts
it('starts YouTube video transcription by CRM library id', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: FetchLike = async (input, init = {}) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({
      jobId: 'job-1',
      video: {
        id: 'video-id',
        youtubeVideoId: 'dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Видео',
        status: 'processing',
        transcriptionJobId: 'job-1',
        createdAt: 1,
        updatedAt: 2
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  };

  const result = await createApiClient({ fetchImpl }).transcribeYouTubeVideo('video-id', {
    engine: 'mlx-whisper',
    screenshotsEnabled: true,
    screenshotIntervalSeconds: 30
  });

  assert.equal(result.jobId, 'job-1');
  assert.equal(requests[0]?.url, 'http://127.0.0.1:2001/videos/library/video-id/transcribe');
  assert.equal(requests[0]?.init.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
    engine: 'mlx-whisper',
    screenshotsEnabled: true,
    screenshotIntervalSeconds: 30
  });
});

it('updates YouTube video transcript fields', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: FetchLike = async (input, init = {}) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({
      video: {
        id: 'video-id',
        youtubeVideoId: 'dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Видео',
        status: 'done',
        cleanText: 'clean',
        createdAt: 1,
        updatedAt: 2
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  };

  const result = await createApiClient({ fetchImpl }).updateYouTubeVideoTranscript('video-id', { cleanText: 'clean' });

  assert.equal(result.video.cleanText, 'clean');
  assert.equal(requests[0]?.url, 'http://127.0.0.1:2001/videos/library/video-id/transcript');
  assert.equal(requests[0]?.init.method, 'PATCH');
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin apps/api/node_modules/.bin/tsx --test packages/api-client/src/index.test.ts
```

Expected: FAIL with `transcribeYouTubeVideo is not a function`.

- [ ] **Step 3: Implement client methods**

In `packages/api-client/src/index.ts`, import the new schemas/types and add:

```ts
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

youtubeVideoScreenshotUrl: (id: string, scope: VideoScreenshotScope, fileName: string) =>
  `${baseUrl}/videos/library/${encodeURIComponent(id)}/screenshots/${scope}/${encodeURIComponent(fileName)}`,
```

- [ ] **Step 4: Run tests and check**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin apps/api/node_modules/.bin/tsx --test packages/api-client/src/index.test.ts
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api-client check
```

Expected: tests pass and package check exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/index.ts packages/api-client/src/index.test.ts
git commit -m "main. Добавить клиент видео-транскрибации"
```

---

### Task 3: Extend `youtube_videos` Storage

**Files:**
- Modify: `apps/api/src/videoLibrary.ts`
- Modify: `apps/api/src/videoLibrary.test.ts`

- [ ] **Step 1: Add failing storage tests**

Add tests to `apps/api/src/videoLibrary.test.ts`:

```ts
it('stores transcript fields in the YouTube video row', async () => {
  const store = createVideoLibraryStore({ dbPath: await tempDbPath(), now: () => 2000 });
  try {
    const added = store.addVideo({ url: 'https://www.youtube.com/watch?v=transcript1' });
    const video = store.saveTranscriptResult(added.video.id, {
      jobId: 'job-1',
      engine: 'mlx-whisper',
      rawText: 'raw',
      cleanText: 'clean',
      formattedText: 'formatted',
      summary: 'summary',
      markdownPath: '/tmp/transcript.md',
      screenshots: [{ fileName: '0001-00-00-30.jpg', timestampSeconds: 30, path: '/tmp/0001.jpg' }]
    });

    assert.equal(video.status, 'done');
    assert.equal(video.cleanText, 'clean');
    assert.equal(video.transcriptionJobId, 'job-1');
    assert.equal(video.transcriptionEngine, 'mlx-whisper');
    assert.equal(video.transcriptionFinishedAt, 2000);
    assert.equal(video.screenshots[0]?.fileName, '0001-00-00-30.jpg');
  } finally {
    store.close();
  }
});

it('drops legacy history tables during video library schema cleanup', async () => {
  const dbPath = await tempDbPath();
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE transcriptions (id TEXT PRIMARY KEY); CREATE TABLE screenshots (id TEXT PRIMARY KEY);');
  db.close();

  const store = createVideoLibraryStore({ dbPath });
  try {
    assert.equal(hasTable(dbPath, 'transcriptions'), false);
    assert.equal(hasTable(dbPath, 'screenshots'), false);
  } finally {
    store.close();
  }
});
```

Add helper:

```ts
function hasTable(dbPath: string, name: string): boolean {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
    return Boolean(row);
  } finally {
    db.close();
  }
}
```

- [ ] **Step 2: Run failing storage tests**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api test
```

Expected: FAIL because `saveTranscriptResult` and cleanup do not exist.

- [ ] **Step 3: Add storage interfaces**

In `apps/api/src/videoLibrary.ts`, add:

```ts
export interface VideoScreenshotRecord {
  fileName: string;
  timestampSeconds: number;
  path: string;
}

export interface SaveVideoTranscriptInput {
  jobId: string;
  engine: string;
  rawText: string;
  cleanText: string;
  formattedText: string;
  summary: string;
  markdownPath: string;
  screenshots: VideoScreenshotRecord[];
}
```

- [ ] **Step 4: Add transcript methods**

Add public methods to `VideoLibraryStore`:

```ts
markTranscriptionProcessing(id: string, input: { jobId: string; engine: string; startedAt?: number }): YouTubeVideo {
  const now = input.startedAt || this.now();
  this.db.prepare(`
    UPDATE youtube_videos
    SET status = 'processing',
        transcription_job_id = ?,
        transcription_engine = ?,
        transcription_error = '',
        transcription_started_at = ?,
        transcription_finished_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(input.jobId, input.engine, now, now, id);
  return this.requireVideoById(id);
}

saveTranscriptResult(id: string, input: SaveVideoTranscriptInput): YouTubeVideo {
  const now = this.now();
  this.db.prepare(`
    UPDATE youtube_videos
    SET status = 'done',
        transcription_job_id = ?,
        transcription_engine = ?,
        raw_text = ?,
        clean_text = ?,
        formatted_text = ?,
        summary = ?,
        markdown_path = ?,
        transcription_error = '',
        transcription_finished_at = ?,
        screenshots_json = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    input.jobId,
    input.engine,
    input.rawText,
    input.cleanText,
    input.formattedText,
    input.summary,
    input.markdownPath,
    now,
    JSON.stringify(input.screenshots),
    now,
    id
  );
  return this.requireVideoById(id);
}

saveTranscriptError(id: string, input: { jobId: string; engine: string; error: string }): YouTubeVideo {
  const now = this.now();
  this.db.prepare(`
    UPDATE youtube_videos
    SET status = 'error',
        transcription_job_id = ?,
        transcription_engine = ?,
        transcription_error = ?,
        transcription_finished_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(input.jobId, input.engine, input.error, now, now, id);
  return this.requireVideoById(id);
}
```

- [ ] **Step 5: Add required columns and cleanup**

In `ensureSchema`, add columns and cleanup:

```ts
this.ensureColumn('transcription_job_id', "TEXT NOT NULL DEFAULT ''");
this.ensureColumn('transcription_engine', "TEXT NOT NULL DEFAULT ''");
this.ensureColumn('raw_text', "TEXT NOT NULL DEFAULT ''");
this.ensureColumn('clean_text', "TEXT NOT NULL DEFAULT ''");
this.ensureColumn('formatted_text', "TEXT NOT NULL DEFAULT ''");
this.ensureColumn('summary', "TEXT NOT NULL DEFAULT ''");
this.ensureColumn('markdown_path', "TEXT NOT NULL DEFAULT ''");
this.ensureColumn('transcription_error', "TEXT NOT NULL DEFAULT ''");
this.ensureColumn('transcription_started_at', 'INTEGER');
this.ensureColumn('transcription_finished_at', 'INTEGER');
this.ensureColumn('screenshots_json', "TEXT NOT NULL DEFAULT '[]'");
this.ensureColumn('trashed_screenshots_json', "TEXT NOT NULL DEFAULT '[]'");
this.db.exec('DROP TABLE IF EXISTS screenshots; DROP TABLE IF EXISTS transcriptions;');
```

- [ ] **Step 6: Update row mapping**

Extend `YouTubeVideoRow` and `mapYouTubeVideoRow` so transcript fields map to camelCase fields defined in shared contracts. Use existing `parseJsonArray` for `screenshots_json` and `trashed_screenshots_json`.

- [ ] **Step 7: Run API tests**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api test
```

Expected: API tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/videoLibrary.ts apps/api/src/videoLibrary.test.ts
git commit -m "main. Расширить хранилище видео транскриптами"
```

---

### Task 4: Video Transcription Job Service

**Files:**
- Create: `apps/api/src/videoTranscription.ts`
- Create: `apps/api/src/videoTranscription.test.ts`
- Modify: `apps/api/src/jobs.ts`

- [ ] **Step 1: Add failing service tests**

Create `apps/api/src/videoTranscription.test.ts`:

```ts
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createVideoLibraryStore } from './videoLibrary.js';
import { startVideoTranscription } from './videoTranscription.js';

describe('video transcription job service', () => {
  it('marks the video as processing before returning a job id', async () => {
    const store = createVideoLibraryStore({ dbPath: await tempDbPath(), now: () => 1000 });
    try {
      const added = store.addVideo({ url: 'https://www.youtube.com/watch?v=process123' });
      const result = startVideoTranscription({
        store,
        videoId: added.video.id,
        engine: 'mlx-whisper',
        screenshotsEnabled: false,
        screenshotIntervalSeconds: 30,
        runner: async () => ({ source: added.video.url, engine: 'mlx-whisper', rawText: 'raw', cleanText: 'clean' })
      });

      assert.equal(result.video.status, 'processing');
      assert.equal(result.video.transcriptionJobId, result.jobId);
    } finally {
      store.close();
    }
  });
});

async function tempDbPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'transcribator-video-transcription-'));
  return path.join(dir, 'test.sqlite');
}
```

- [ ] **Step 2: Run failing test**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api test
```

Expected: FAIL because `videoTranscription.ts` does not exist.

- [ ] **Step 3: Remove history persistence from jobs**

In `apps/api/src/jobs.ts`, remove imports from `transcriptionStore`, remove `listHistory`, remove `saveHistoryEntry`, and keep `createJob` as an in-memory job runner. The catch/done branches should only emit events unless the task itself persists results.

- [ ] **Step 4: Implement service**

Create `apps/api/src/videoTranscription.ts`:

```ts
import { createHttpError } from './errors.js';
import { createJob } from './jobs.js';
import { transcribeUrl } from './pipeline.js';
import { defaultVideoLibraryStore, type VideoLibraryStore } from './videoLibrary.js';
import type { JobTranscriptionResult, ProgressHandler } from './types.js';
import type { TranscriptionEngine } from '@transcribator/shared';

export interface StartVideoTranscriptionOptions {
  store?: VideoLibraryStore;
  videoId: string;
  engine?: TranscriptionEngine | undefined;
  screenshotsEnabled: boolean;
  screenshotIntervalSeconds: number;
  runner?: ((onProgress: ProgressHandler, context: { jobId: string; startedAt: number }) => Promise<JobTranscriptionResult>) | undefined;
}

export function startVideoTranscription(options: StartVideoTranscriptionOptions) {
  const store = options.store || defaultVideoLibraryStore;
  const video = store.getVideoById(options.videoId);
  if (!video) throw createHttpError(404, 'Видео не найдено.');
  if (video.status === 'processing' && video.transcriptionJobId) {
    throw createHttpError(409, 'Видео уже транскрибируется.');
  }

  const engine = options.engine || 'mlx-whisper';
  const job = createJob(
    async (onProgress, context) => {
      try {
        const result = options.runner
          ? await options.runner(onProgress, context)
          : await transcribeUrl(video.url, {
              engine,
              screenshotsEnabled: options.screenshotsEnabled,
              screenshotIntervalSeconds: options.screenshotIntervalSeconds,
              jobId: video.id,
              startedAt: context.startedAt,
              onProgress
            });

        store.saveTranscriptResult(video.id, {
          jobId: context.jobId,
          engine: result.engine || engine,
          rawText: result.rawText || '',
          cleanText: result.cleanText || result.text || '',
          formattedText: result.formattedText || '',
          summary: result.summary || '',
          markdownPath: result.markdownPath || '',
          screenshots: []
        });
        return result;
      } catch (error) {
        store.saveTranscriptError(video.id, {
          jobId: context.jobId,
          engine,
          error: error instanceof Error ? error.message : 'Unexpected transcription error.'
        });
        throw error;
      }
    },
    { sourceType: 'youtube-video', source: video.url, engine },
    { persistHistory: false }
  );

  return {
    jobId: job.id,
    video: store.markTranscriptionProcessing(video.id, { jobId: job.id, engine, startedAt: job.createdAt })
  };
}
```

- [ ] **Step 5: Run API tests**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api test
```

Expected: API tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/jobs.ts apps/api/src/videoTranscription.ts apps/api/src/videoTranscription.test.ts
git commit -m "main. Добавить запуск транскрибации видео"
```

---

### Task 5: Video Artifacts And Screenshot JSON Operations

**Files:**
- Create: `apps/api/src/videoArtifacts.ts`
- Create: `apps/api/src/videoArtifacts.test.ts`
- Modify: `apps/api/src/videoLibrary.ts`

- [ ] **Step 1: Add failing artifact tests**

Create `apps/api/src/videoArtifacts.test.ts` with tests for markdown and screenshot trash:

```ts
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { createVideoLibraryStore } from './videoLibrary.js';
import { createVideoMarkdown, trashVideoScreenshots } from './videoArtifacts.js';

describe('video artifacts', () => {
  it('creates markdown from video transcript fields', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'transcribator-video-artifacts-'));
    const store = createVideoLibraryStore({ dbPath: path.join(root, 'test.sqlite'), now: () => 1000 });
    try {
      const added = store.addVideo({ url: 'https://www.youtube.com/watch?v=markdown1', title: 'Видео' });
      store.saveTranscriptResult(added.video.id, {
        jobId: 'job-1',
        engine: 'mlx-whisper',
        rawText: 'raw',
        cleanText: 'clean',
        formattedText: '# formatted',
        summary: 'summary',
        markdownPath: '',
        screenshots: []
      });

      const response = await createVideoMarkdown({ store, runtimeDir: root, id: added.video.id });
      const markdown = await readFile(response.video.markdownPath, 'utf8');

      assert.match(markdown, /# Видео/);
      assert.match(markdown, /summary/);
      assert.match(markdown, /# formatted/);
    } finally {
      store.close();
    }
  });

  it('moves selected screenshots to trash and updates JSON state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'transcribator-video-artifacts-'));
    const screenshotsDir = path.join(root, 'artifacts', 'video-id', 'screenshots');
    await mkdir(screenshotsDir, { recursive: true });
    await writeFile(path.join(screenshotsDir, '0001-00-00-30.jpg'), 'image');
    const store = createVideoLibraryStore({ dbPath: path.join(root, 'test.sqlite'), now: () => 1000 });
    try {
      const added = store.addVideo({ url: 'https://www.youtube.com/watch?v=screens1' });
      store.saveTranscriptResult(added.video.id, {
        jobId: 'job-1',
        engine: 'mlx-whisper',
        rawText: '',
        cleanText: '',
        formattedText: '',
        summary: '',
        markdownPath: '',
        screenshots: [{ fileName: '0001-00-00-30.jpg', timestampSeconds: 30, path: path.join(screenshotsDir, '0001-00-00-30.jpg') }]
      });

      const result = await trashVideoScreenshots({ store, runtimeDir: root, id: added.video.id, fileNames: ['0001-00-00-30.jpg'] });

      assert.deepEqual(result.moved, ['0001-00-00-30.jpg']);
      assert.equal(result.video.screenshots.length, 0);
      assert.equal(result.video.trashedScreenshots[0]?.fileName, '0001-00-00-30.jpg');
    } finally {
      store.close();
    }
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api test
```

Expected: FAIL because `videoArtifacts.ts` does not exist.

- [ ] **Step 3: Add screenshot mutation methods to store**

In `VideoLibraryStore`, add:

```ts
updateScreenshotState(id: string, screenshots: VideoScreenshotRecord[], trashedScreenshots: VideoScreenshotRecord[]): YouTubeVideo {
  const now = this.now();
  this.db.prepare(`
    UPDATE youtube_videos
    SET screenshots_json = ?,
        trashed_screenshots_json = ?,
        updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(screenshots), JSON.stringify(trashedScreenshots), now, id);
  return this.requireVideoById(id);
}

updateTranscriptText(id: string, patch: { rawText?: string; cleanText?: string; formattedText?: string; summary?: string }): YouTubeVideo {
  const current = this.requireVideoById(id);
  const now = this.now();
  this.db.prepare(`
    UPDATE youtube_videos
    SET raw_text = ?,
        clean_text = ?,
        formatted_text = ?,
        summary = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    patch.rawText ?? current.rawText,
    patch.cleanText ?? current.cleanText,
    patch.formattedText ?? current.formattedText,
    patch.summary ?? current.summary,
    now,
    id
  );
  return this.requireVideoById(id);
}

updateMarkdownPath(id: string, markdownPath: string): YouTubeVideo {
  const now = this.now();
  this.db.prepare('UPDATE youtube_videos SET markdown_path = ?, updated_at = ? WHERE id = ?').run(markdownPath, now, id);
  return this.requireVideoById(id);
}
```

- [ ] **Step 4: Implement `videoArtifacts.ts`**

Implement exported functions:

```ts
export async function createVideoMarkdown(options: { store?: VideoLibraryStore; runtimeDir?: string; id: string }): Promise<YouTubeVideoTranscriptResponse>
export async function trashVideoScreenshots(options: { store?: VideoLibraryStore; runtimeDir?: string; id: string; fileNames: string[] }): Promise<YouTubeVideoScreenshotsOperationResponse>
export async function restoreVideoScreenshots(options: { store?: VideoLibraryStore; runtimeDir?: string; id: string; fileNames: string[] }): Promise<YouTubeVideoScreenshotsOperationResponse>
export async function clearVideoScreenshotsTrash(options: { store?: VideoLibraryStore; runtimeDir?: string; id: string }): Promise<YouTubeVideoScreenshotsOperationResponse>
export async function getVideoScreenshotPath(options: { store?: VideoLibraryStore; id: string; scope: VideoScreenshotScope; fileName: string }): Promise<string>
```

Use `runtime/artifacts/<video.id>/screenshots` and `runtime/artifacts/<video.id>/trash/screenshots`. Return `{ video, moved, missing, deleted }` with arrays filled for each operation.

- [ ] **Step 5: Run API tests**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api test
```

Expected: API tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/videoLibrary.ts apps/api/src/videoArtifacts.ts apps/api/src/videoArtifacts.test.ts
git commit -m "main. Добавить артефакты видео"
```

---

### Task 6: API Routes Replace History Routes

**Files:**
- Modify: `apps/api/src/index.ts`
- Delete after no imports: `apps/api/src/historyDetails.ts`, `apps/api/src/historyDetails.test.ts`, `apps/api/src/markdownArtifacts.ts`, `apps/api/src/markdownArtifacts.test.ts`, `apps/api/src/transcriptionStore.ts`, `apps/api/src/transcriptionStore.test.ts`, `apps/api/src/transcriptPersistence.ts`, `apps/api/src/transcriptPersistence.test.ts`

- [ ] **Step 1: Remove history imports and startup migration**

In `apps/api/src/index.ts`, remove:

```ts
historyScreenshotScopeSchema,
historyScreenshotsRequestSchema,
screenshotFileNameSchema,
updateHistoryEntryRequestSchema
```

Remove imports:

```ts
import { createJob, getJob, listHistory } from './jobs.js';
import { historyDetailsService } from './historyDetails.js';
import { defaultTranscriptionStore, migrateHistoryJsonToSqlite } from './transcriptionStore.js';
```

Replace with:

```ts
import { createJob, getJob } from './jobs.js';
import { startVideoTranscription } from './videoTranscription.js';
import {
  clearVideoScreenshotsTrash,
  createVideoMarkdown,
  getVideoScreenshotPath,
  restoreVideoScreenshots,
  trashVideoScreenshots
} from './videoArtifacts.js';
```

Remove:

```ts
await migrateHistoryJsonToSqlite({ store: defaultTranscriptionStore });
```

- [ ] **Step 2: Make root transcribe routes transient**

In `/transcribe/url` and `/transcribe/file`, pass `{ persistHistory: false }` as the third argument to `createJob`.

- [ ] **Step 3: Delete history route blocks**

Remove all route handlers from `app.get('/transcribe/history'...)` through the screenshot file route under `/transcribe/history/:id/screenshots/:scope/:fileName`.

- [ ] **Step 4: Add video route imports and schemas**

Import from shared:

```ts
updateYouTubeVideoTranscriptRequestSchema,
videoScreenshotScopeSchema,
videoScreenshotsRequestSchema,
youtubeVideoTranscriptionRequestSchema
```

- [ ] **Step 5: Add new video routes**

Add after `/videos/library/:id/metadata`:

```ts
app.post('/videos/library/:id/transcribe', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const body = youtubeVideoTranscriptionRequestSchema.parse(req.body || {});
    res.status(202).json(startVideoTranscription({
      videoId: String(req.params.id || ''),
      engine: body.engine,
      screenshotsEnabled: body.screenshotsEnabled,
      screenshotIntervalSeconds: body.screenshotIntervalSeconds
    }));
  } catch (error) {
    next(error);
  }
});

app.patch('/videos/library/:id/transcript', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const body = updateYouTubeVideoTranscriptRequestSchema.parse(req.body || {});
    res.json({ video: defaultVideoLibraryStore.updateTranscriptText(String(req.params.id || ''), body) });
  } catch (error) {
    next(error);
  }
});
```

Add markdown/screenshot routes using `createVideoMarkdown`, `trashVideoScreenshots`, `restoreVideoScreenshots`, `clearVideoScreenshotsTrash`, and `getVideoScreenshotPath`.

- [ ] **Step 6: Run API tests/typecheck/build**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api test
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api typecheck
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api build
```

Expected: all exit 0.

- [ ] **Step 7: Delete obsolete API files after imports are gone**

Run:

```bash
rg -n "historyDetails|markdownArtifacts|transcriptionStore|transcriptPersistence|listHistory|/transcribe/history" apps/api/src
```

Expected: no references that are still required. Then remove obsolete files with `git rm`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "main. Заменить API истории маршрутами видео"
```

---

### Task 7: CRM Navigation And Route Removal

**Files:**
- Modify: `apps/crm/src/components/crm-navigation.ts`
- Modify: `apps/crm/src/components/crm-navigation.test.ts`
- Delete: `apps/crm/app/history/page.tsx`
- Delete: `apps/crm/app/history/[id]/page.tsx`

- [ ] **Step 1: Update navigation test first**

Change `crm-navigation.test.ts` expected items to:

```ts
assert.deepEqual(crmNavigationItems.map((item) => [item.id, item.href, item.label]), [
  ['videos', '/videos', 'Видео'],
  ['transcribe', '/', 'Транскрибатор'],
  ['download', '/download', 'Скачать видео'],
  ['compress', '/compress', 'Сжать видео']
]);
```

Remove the history-detail URL test.

- [ ] **Step 2: Run failing navigation test**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node_modules/.pnpm/node_modules/.bin/tsx --test apps/crm/src/components/crm-navigation.test.ts
```

Expected: FAIL because History still exists.

- [ ] **Step 3: Remove History from navigation**

In `crm-navigation.ts`:

```ts
export type AppView = 'transcribe' | 'videos' | 'videoDetail' | 'download' | 'compress';

export const crmNavigationItems: CrmNavigationItem[] = [
  { id: 'videos', href: '/videos', label: 'Видео' },
  { id: 'transcribe', href: '/', label: 'Транскрибатор' },
  { id: 'download', href: '/download', label: 'Скачать видео' },
  { id: 'compress', href: '/compress', label: 'Сжать видео' }
];
```

Keep `buildVideoDetailPath`; remove `buildHistoryDetailPath`.

- [ ] **Step 4: Delete history pages**

Run:

```bash
git rm apps/crm/app/history/page.tsx 'apps/crm/app/history/[id]/page.tsx'
```

- [ ] **Step 5: Run CRM navigation test**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node_modules/.pnpm/node_modules/.bin/tsx --test apps/crm/src/components/crm-navigation.test.ts
```

Expected: tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/crm/src/components/crm-navigation.ts apps/crm/src/components/crm-navigation.test.ts apps/crm/app/history
git commit -m "main. Удалить раздел истории из CRM"
```

---

### Task 8: CRM Video Transcript UI

**Files:**
- Modify: `apps/crm/src/components/transcribator-app.tsx`
- Create: `apps/crm/src/components/video-transcript.ts`
- Create: `apps/crm/src/components/video-transcript.test.ts`
- Rename: `apps/crm/src/components/history-lightbox-navigation.ts` to `apps/crm/src/components/screenshot-lightbox-navigation.ts`
- Rename: `apps/crm/src/components/history-lightbox-navigation.test.ts` to `apps/crm/src/components/screenshot-lightbox-navigation.test.ts`
- Delete: `apps/crm/src/components/history-delete.ts`
- Delete: `apps/crm/src/components/history-delete.test.ts`

- [ ] **Step 1: Add video transcript helper test**

Create `apps/crm/src/components/video-transcript.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getVideoTranscriptStatusLabel, hasVideoTranscriptText } from './video-transcript.js';

describe('video transcript helpers', () => {
  it('detects whether a YouTube video has transcript text', () => {
    assert.equal(hasVideoTranscriptText({ rawText: '', cleanText: '', formattedText: '' }), false);
    assert.equal(hasVideoTranscriptText({ rawText: '', cleanText: 'clean', formattedText: '' }), true);
  });

  it('formats video transcript status labels', () => {
    assert.equal(getVideoTranscriptStatusLabel({ status: 'added', cleanText: '', transcriptionError: '' }), 'Не транскрибировано');
    assert.equal(getVideoTranscriptStatusLabel({ status: 'processing', cleanText: '', transcriptionError: '' }), 'Транскрибируется');
    assert.equal(getVideoTranscriptStatusLabel({ status: 'done', cleanText: 'clean', transcriptionError: '' }), 'Готово');
    assert.equal(getVideoTranscriptStatusLabel({ status: 'error', cleanText: '', transcriptionError: 'fail' }), 'Ошибка');
  });
});
```

- [ ] **Step 2: Run failing helper test**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node_modules/.pnpm/node_modules/.bin/tsx --test apps/crm/src/components/video-transcript.test.ts
```

Expected: FAIL because helper file does not exist.

- [ ] **Step 3: Implement helper**

Create `apps/crm/src/components/video-transcript.ts`:

```ts
import type { YouTubeVideo } from '@transcribator/shared';

type TranscriptStatusInput = Pick<YouTubeVideo, 'status' | 'cleanText' | 'rawText' | 'formattedText' | 'transcriptionError'>;

export function hasVideoTranscriptText(video: Pick<YouTubeVideo, 'cleanText' | 'rawText' | 'formattedText'>): boolean {
  return Boolean(video.formattedText.trim() || video.cleanText.trim() || video.rawText.trim());
}

export function getVideoTranscriptStatusLabel(video: TranscriptStatusInput): string {
  if (video.status === 'processing') return 'Транскрибируется';
  if (video.status === 'error') return 'Ошибка';
  return hasVideoTranscriptText(video) ? 'Готово' : 'Не транскрибировано';
}
```

- [ ] **Step 4: Rename lightbox helper**

Use `git mv`:

```bash
git mv apps/crm/src/components/history-lightbox-navigation.ts apps/crm/src/components/screenshot-lightbox-navigation.ts
git mv apps/crm/src/components/history-lightbox-navigation.test.ts apps/crm/src/components/screenshot-lightbox-navigation.test.ts
```

Update imports and test descriptions from history to screenshot.

- [ ] **Step 5: Remove history state from `transcribator-app.tsx`**

Remove imports and state tied to `HistoryEntry`, `HistoryDetailResponse`, `HistoryAction`, `history`, `historyDetail`, `historyForm`, `historyLoading`, `historySaving`, `historyAction`, `historyError`, `deletingHistoryId`, `buildHistoryDeleteConfirmationMessage`, and history route effects.

- [ ] **Step 6: Add video transcription state**

Add state:

```ts
const [transcribingVideoId, setTranscribingVideoId] = React.useState('');
const [videoTranscriptionError, setVideoTranscriptionError] = React.useState('');
const [videoTranscriptionStages, setVideoTranscriptionStages] = React.useState<StageState[]>([]);
const [videoTranscriptionElapsedSeconds, setVideoTranscriptionElapsedSeconds] = React.useState(0);
const videoTranscriptionEventSourceRef = React.useRef<EventSource | null>(null);
```

- [ ] **Step 7: Add video transcribe action**

Add function:

```ts
async function transcribeYouTubeVideo(video: YouTubeVideo) {
  setVideoTranscriptionError('');
  setTranscribingVideoId(video.id);
  setVideoTranscriptionStages(createInitialStages(['download', 'transcribe', 'postprocess']));

  try {
    const response = await api.transcribeYouTubeVideo(video.id, {
      engine,
      screenshotsEnabled,
      screenshotIntervalSeconds
    });
    upsertYouTubeVideo(response.video);
    subscribeToVideoTranscriptionJob(response.jobId, video.id);
  } catch (error) {
    setVideoTranscriptionError(error instanceof Error ? error.message : 'Не удалось запустить транскрибацию видео.');
    setTranscribingVideoId('');
  }
}
```

- [ ] **Step 8: Add video list button**

In each `/videos` card, add button before “Подробнее”:

```tsx
<Button
  type="button"
  className="w-fit"
  onClick={() => void transcribeYouTubeVideo(video)}
  disabled={video.status === 'processing' || transcribingVideoId === video.id}
>
  <FileText className="h-4 w-4" />
  {video.status === 'processing' || transcribingVideoId === video.id ? 'Транскрибируется' : 'Транскрибировать'}
</Button>
```

- [ ] **Step 9: Add transcript section to video detail**

After metadata cards on `/videos/[id]`, render:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Транскрипт</CardTitle>
  </CardHeader>
  <CardContent className="grid gap-3">
    <Badge variant={youtubeVideoDetail.status === 'error' ? 'error' : youtubeVideoDetail.status === 'done' ? 'success' : 'secondary'}>
      {getVideoTranscriptStatusLabel(youtubeVideoDetail)}
    </Badge>
    {youtubeVideoDetail.transcriptionError && (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{youtubeVideoDetail.transcriptionError}</p>
    )}
    <Textarea value={youtubeVideoDetail.cleanText} readOnly rows={12} />
  </CardContent>
</Card>
```

- [ ] **Step 10: Delete history-only helper files**

Run:

```bash
git rm apps/crm/src/components/history-delete.ts apps/crm/src/components/history-delete.test.ts
```

- [ ] **Step 11: Run CRM tests/check**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node_modules/.pnpm/node_modules/.bin/tsx --test apps/crm/src/components/video-transcript.test.ts apps/crm/src/components/screenshot-lightbox-navigation.test.ts apps/crm/src/components/crm-navigation.test.ts
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/crm check
```

Expected: tests and CRM build pass.

- [ ] **Step 12: Commit**

```bash
git add apps/crm
git commit -m "main. Перенести транскрибацию в раздел видео"
```

---

### Task 9: Remove Shared/API History Surface

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/api-client/src/index.ts`
- Modify: `packages/api-client/src/index.test.ts`
- Modify: `apps/api/src/types.ts`

- [ ] **Step 1: Search remaining history references**

Run:

```bash
rg -n "History|history|/transcribe/history|transcriptions|screenshots" packages apps README.md docs/agent
```

Expected: references remain in docs and files not yet cleaned. Use this list for exact removals.

- [ ] **Step 2: Remove history exports from shared**

Remove types and schemas that are no longer imported:

```ts
historyEntrySchema
historyResponseSchema
historyDeleteResponseSchema
historyScreenshotSchema
historyDetailResponseSchema
updateHistoryEntryRequestSchema
historyScreenshotsRequestSchema
historyScreenshotScopeSchema
historyScreenshotsOperationResponseSchema
HistoryEntry
HistoryResponse
HistoryDeleteResponse
HistoryScreenshot
HistoryDetailResponse
UpdateHistoryEntryRequest
HistoryScreenshotsRequest
HistoryScreenshotScope
HistoryScreenshotsOperationResponse
```

- [ ] **Step 3: Remove history client methods**

Remove from `packages/api-client/src/index.ts`:

```ts
getHistory
getHistoryEntry
updateHistoryEntry
deleteHistoryEntry
formatHistoryEntry
createHistoryMarkdown
trashHistoryScreenshots
restoreHistoryScreenshots
clearHistoryScreenshotsTrash
historyScreenshotUrl
```

- [ ] **Step 4: Run workspace checks**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/shared check
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api-client check
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api typecheck
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/crm check
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/api-client/src/index.ts packages/api-client/src/index.test.ts apps/api/src/types.ts
git commit -m "main. Удалить контракты старой истории"
```

---

### Task 10: Documentation And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/agent/PROJECT_MAP.md`
- Modify: `docs/agent/INFRASTRUCTURE.md`
- Modify: `docs/agent/CHANGELOG.md`

- [ ] **Step 1: Update docs**

Document:

- `/videos` is the main saved workflow.
- `youtube_videos` is the single user table for YouTube metadata and transcription output.
- History UI/API/table was removed; old data is not migrated.
- New endpoints under `/videos/library/:id/...`.
- `runtime/artifacts/<video-id>/` stores markdown/screenshots for videos.

- [ ] **Step 2: Run final search**

Run:

```bash
rg -n "История|history|/history|/transcribe/history|transcriptions|history.json|screenshots table" README.md docs/agent apps packages
```

Expected: no stale user-facing references to a live History feature. Accept references only when explicitly saying it was removed or is legacy cleanup.

- [ ] **Step 3: Run full verification**

Run:

```bash
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/shared check
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api-client check
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api test
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api typecheck
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/api build
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/crm check
env PATH=/Users/alexganin/.nvm/versions/node/v24.17.0/bin:/Users/alexganin/.nvm/versions/node/v22.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm --filter @transcribator/extension check
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit docs**

```bash
git add README.md docs/agent/PROJECT_MAP.md docs/agent/INFRASTRUCTURE.md docs/agent/CHANGELOG.md
git commit -m "main. Обновить документацию единой модели видео"
```

- [ ] **Step 5: Final status**

Run:

```bash
git status --short
```

Expected: clean working tree.

---

## Self-Review

Spec coverage:

- History UI removal: Task 7 and Task 8.
- History API removal: Task 6 and Task 9.
- Dropping `transcriptions` and `screenshots`: Task 3 and Task 6.
- Storing all user video state in `youtube_videos`: Task 1, Task 3, Task 4, Task 5.
- Transcribe button in `/videos`: Task 8.
- SSE progress via existing `/jobs/:id/events`: Task 4 and Task 8.
- Markdown/screenshots in video detail: Task 5 and Task 8.
- Documentation: Task 10.

Placeholder scan:

- No unresolved markers.
- No unresolved function names: new functions are introduced in the tasks before use or in the same task.
- Commands use exact project paths and current Node PATH.

Type consistency:

- Shared camelCase fields match planned SQLite snake_case columns.
- API client response schemas match route response shapes.
- CRM helper names use video terminology instead of history terminology.
