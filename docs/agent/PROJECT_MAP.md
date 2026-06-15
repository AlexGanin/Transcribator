# Project Map

This file maps the current repository structure and the responsibility of each important file.

## Top-Level Layout

```txt
Transcribator
  client/              React + Vite browser UI
  server/              Express API and transcription pipeline
  source/              Runtime copy of uploaded source files
  tmp/                 Runtime temporary uploads, WAV files, and CLI output folders
  output/              Runtime transcript files and history.json
  docs/agent/          Agent-facing project documentation
  package.json         Root orchestration scripts
  package-lock.json    Root dependency lockfile for orchestration dependencies
  README.md            Human-facing setup and usage guide
```

## Root Files

- `package.json`
  - Owns root commands.
  - `npm run dev` starts server and client concurrently.
  - `npm run install:all` installs dependencies for `server/` and `client/`.
  - `npm run check` runs server syntax checks and client production build.

- `package-lock.json`
  - Locks the root dependency graph.
  - Currently needed for `concurrently`.

- `.gitignore`
  - Ignores dependency folders and runtime output under `source/`, `output/`, and `tmp/`.
  - Ignores local Next.js artifacts under `.next/`.
  - Keeps `.gitkeep` files so runtime directories exist in a fresh checkout.

- `README.md`
  - User-facing overview, install, run, API, and pipeline notes.
  - Should stay concise and link here for agent-facing implementation detail.

## Client

```txt
client
  index.html
  package.json
  package-lock.json
  src
    main.jsx
    styles.css
```

- `client/package.json`
  - Vite app scripts and frontend dependencies.
  - `npm run dev --prefix client` runs Vite at `127.0.0.1:3002` with `--strictPort`.
  - `npm run build --prefix client` builds production assets.

- `client/src/main.jsx`
  - Main React application.
  - Owns UI state for source mode, URL, selected file, engine, run status, progress stages, result text, and history.
  - Talks to the API through `API_URL`, defaulting to `http://localhost:3001`.
  - Opens an `EventSource` for `/transcribe/jobs/:id/events`.
  - Sends URL requests as JSON and file requests as multipart form data.

- `client/src/styles.css`
  - Global styles for the app shell, form, progress, results, and history.
  - The current UI is plain CSS, not a component library.

## Server

```txt
server
  .env.example
  package.json
  package-lock.json
  src
    index.js
    jobs.js
    pipeline.js
    postProcess.js
```

- `server/package.json`
  - Express server scripts and dependencies.
  - `npm run dev --prefix server` and `npm run start --prefix server` both run `node src/index.js`.
  - `npm run check --prefix server` syntax-checks the server entry and pipeline files.

- `server/.env.example`
  - Documents server runtime configuration.
  - Copy to `server/.env` for local secrets and command paths.

- `server/src/index.js`
  - Express app entry point.
  - Loads `.env` via `dotenv/config`.
  - Binds to `HOST` and `PORT`, defaulting to `127.0.0.1:3001`.
  - Configures CORS, JSON parsing, multer uploads, route handlers, SSE, and error handling.
  - Routes:
    - `GET /health`
    - `POST /transcribe/url`
    - `POST /transcribe/file`
    - `GET /transcribe/history`
    - `GET /transcribe/jobs/:id/events`

- `server/src/jobs.js`
  - In-memory job registry and event emitter layer.
  - Starts transcription tasks asynchronously with `queueMicrotask`.
  - Stores live events for SSE replay.
  - Writes run history to `output/history.json`.
  - Keeps up to 200 history entries.

- `server/src/pipeline.js`
  - Core transcription pipeline.
  - Validates URL and file inputs.
  - Checks required external commands with `which` or `where`.
  - Uses Node streams and `child_process.spawn` to run `yt-dlp`, `ffmpeg`, `whisper`, and `mlx_whisper`.
  - Supports engines:
    - `mlx-whisper`
    - `openai-whisper`
    - `local-stdin`
    - `openai`
  - Emits progress stages to `jobs.js`.
  - Writes final transcript files to `output/<timestamp>.txt`.

- `server/src/postProcess.js`
  - Local transcript cleanup and simple summary generation.
  - Removes common noise tokens, normalizes spacing, capitalizes sentences, groups paragraphs, and selects summary sentences.

## Runtime Directories

- `source/`
  - Receives a safe-name copy of uploaded source files.
  - Contents are ignored by git except `.gitkeep`.

- `tmp/`
  - Receives multer uploads, temporary WAV files, and Whisper output folders.
  - Contents are ignored by git except `.gitkeep`.

- `output/`
  - Receives final transcript `.txt` files and `history.json`.
  - Contents are ignored by git except `.gitkeep`.

## Data Flow

### URL Transcription

```txt
Browser form
  -> POST /transcribe/url
  -> jobs.createJob
  -> pipeline.transcribeUrl
  -> yt-dlp stdout
  -> ffmpeg stdin/stdout
  -> temp WAV or whisper stdin
  -> selected transcription engine
  -> postProcessTranscript + summarizeTranscript
  -> output/<timestamp>.txt
  -> output/history.json
  -> SSE progress/done events
  -> Browser result panes and history
```

### File Transcription

```txt
Browser multipart upload
  -> POST /transcribe/file
  -> multer temp upload
  -> source/<safe_original_filename>
  -> jobs.createJob
  -> pipeline.transcribeFile
  -> ffmpeg conversion
  -> selected transcription engine
  -> postProcessTranscript + summarizeTranscript
  -> output/<timestamp>.txt
  -> output/history.json
  -> SSE progress/done events
  -> Browser result panes and history
```

## Generated And Local Files

Do not commit these unless the project intentionally changes policy:

- `node_modules/`
- `client/node_modules/`
- `server/node_modules/`
- `client/dist/`
- `.next/`
- Runtime contents of `source/`, `tmp/`, and `output/`
- `server/.env`
