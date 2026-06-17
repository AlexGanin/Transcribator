# Project Map

This file maps the current repository structure and the responsibility of each important area.

## Top-Level Layout

```txt
Transcribator
  apps/
    api/          Express API and transcription/video pipeline
    crm/          Next.js App Router CRM
    extension/    WXT React Chrome extension
  packages/
    api-client/   fetch-based API client
    shared/       Zod schemas, DTOs and shared types
    ui/           shared shadcn-style React components
  source/         Runtime copy of uploaded source files
  tmp/            Runtime temporary uploads, WAV files and CLI output folders
  output/         Runtime transcript files and history.json
  downloads/      Runtime downloaded YouTube videos
  docs/agent/     Agent-facing project documentation
  package.json    Root pnpm workspace commands
  pnpm-lock.yaml  Workspace lockfile
```

## Root Files

- `package.json`
  - Owns root `dev`, `build`, `typecheck` and `check` commands.
  - Starts the Express API and Next CRM together for local development.

- `pnpm-workspace.yaml`
  - Includes `apps/*` and `packages/*`.

- `tsconfig.base.json`
  - Shared strict TypeScript defaults for new apps and packages.

- `.gitignore`
  - Ignores dependency folders, Next/WXT build output, package `dist/` folders and runtime output under `downloads/`, `source/`, `output/`, and `tmp/`.

- `README.md`
  - Human-facing overview, install, run, API and architecture notes.

## Apps

### `apps/api`

```txt
apps/api
  .env.example
  package.json
  src
    index.js
    jobs.js
    pipeline.js
    postProcess.js
    videoDownload.js
```

- `src/index.js`
  - Express app entry point.
  - Loads `apps/api/.env`.
  - Binds to `HOST` and `PORT`, defaulting to `127.0.0.1:3001`.
  - Configures CORS, JSON parsing, multer uploads, route handlers, SSE and error handling.
  - Validates request bodies with schemas from `@transcribator/shared`.

- `src/jobs.js`
  - In-memory job registry and event emitter layer.
  - Starts transcription tasks asynchronously.
  - Stores live events for SSE replay.
  - Writes run history to root `output/history.json`.

- `src/pipeline.js`
  - Core transcription pipeline.
  - Uses root `source/`, `tmp/` and `output/`.
  - Runs `yt-dlp`, `ffmpeg`, local Whisper engines or OpenAI Audio Transcriptions.
  - Emits progress stages to `jobs.js`.

- `src/videoDownload.js`
  - Reads available video formats with `yt-dlp --dump-json`.
  - Downloads selected formats to root `downloads/`.

### `apps/crm`

```txt
apps/crm
  app/
    globals.css
    layout.tsx
    page.tsx
  src/components/transcribator-app.tsx
```

- Next.js App Router TypeScript app.
- Runs at `127.0.0.1:3002`.
- Uses `@transcribator/api-client` for every API call.
- Uses `@transcribator/ui` for shared controls.
- Provides:
  - URL transcription
  - file transcription
  - transcription engine selection
  - SSE progress
  - transcription history
  - video format selection
  - video downloads

### `apps/extension`

```txt
apps/extension
  entrypoints/
    background.ts
    content.ts
    popup/
      index.html
      main.tsx
      popup-app.tsx
      style.css
  wxt.config.ts
```

- WXT + React + TypeScript Manifest V3 extension.
- Popup uses `@transcribator/api-client`.
- Background service worker stores extension defaults and the last YouTube URL.
- YouTube content script uses Shadow DOM style isolation.
- No remote hosted code is used.

## Packages

### `packages/shared`

- Owns Zod API contracts and `z.infer` types.
- Includes request schemas, response schemas, progress event schemas, engine enum, job status enum, video format DTOs and API error DTOs.
- Must not import React, Next, Chrome APIs or Node-only APIs.

### `packages/api-client`

- Pure fetch-based client.
- Works in the Next CRM, extension popup/background/content scripts and normal browser contexts.
- Imports and validates against `packages/shared` schemas.
- Normalizes failed responses into `ApiClientError`.
- Must not import React, TanStack Query, Next APIs, Chrome APIs or Node-only APIs.

### `packages/ui`

- Shared React components styled with Tailwind classes and Radix primitives.
- Includes Button, Input, Textarea, Select, Tabs, Progress, Badge and Card primitives.
- Each component lives in its own folder under `src/components/<component>/index.tsx` so stories, notes and component-local files can sit next to implementation.
- Must stay framework-agnostic: no Next APIs, Chrome APIs or Node APIs.

## Runtime Directories

- `source/`: safe-name copies of uploaded source files.
- `tmp/`: multer uploads, generated WAV files and Whisper output folders.
- `output/`: final transcript `.txt` files and `history.json`.
- `downloads/`: downloaded YouTube videos.

Only `.gitkeep` files should be committed from these directories.

## Data Flow

### URL Transcription

```txt
CRM or extension
  -> packages/api-client
  -> POST /transcribe/url
  -> shared Zod validation
  -> jobs.createJob
  -> pipeline.transcribeUrl
  -> yt-dlp stdout
  -> ffmpeg stdin/stdout
  -> selected transcription engine
  -> postProcessTranscript + summarizeTranscript
  -> output/<timestamp>.txt
  -> output/history.json
  -> SSE progress/done events
  -> CRM result panes and history
```

### File Transcription

```txt
CRM multipart upload
  -> packages/api-client
  -> POST /transcribe/file
  -> shared Zod validation for form fields
  -> multer temp upload
  -> source/<safe_original_filename>
  -> jobs.createJob
  -> pipeline.transcribeFile
  -> ffmpeg conversion
  -> selected transcription engine
  -> output/<timestamp>.txt
  -> output/history.json
  -> SSE progress/done events
```

### Video Download

```txt
CRM video URL
  -> packages/api-client
  -> POST /videos/formats
  -> shared Zod validation
  -> videoDownload.getVideoFormats
  -> yt-dlp --dump-json
  -> CRM format selector
  -> POST /videos/download
  -> videoDownload.downloadVideo
  -> downloads/<safe_title-formatId>.<ext>
```

## Generated And Local Files

Do not commit these unless the project intentionally changes policy:

- `node_modules/`
- `apps/crm/.next/`
- `apps/extension/.wxt/`
- `apps/extension/.output/`
- `packages/*/dist/`
- Runtime contents of `downloads/`, `source/`, `tmp/` and `output/`
- Any `.env` file
