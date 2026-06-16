# Infrastructure

This file documents local runtime infrastructure, commands, ports, environment variables, and external dependencies.

## Runtime Model

Transcribator currently runs as two local processes:

- Frontend: Vite dev server at `http://localhost:3002`.
- Backend: Express API at `http://localhost:3001`.

The frontend calls the backend directly through `http://localhost:3001`. CORS is enabled by the backend.

## Ports

| Service | Default | Source |
| --- | --- | --- |
| Client UI | `127.0.0.1:3002` | `client/package.json` |
| Server API | `127.0.0.1:3001` | `server/src/index.js`, overridable by `server/.env` |

The client uses `--strictPort`, so it fails instead of silently moving to another port if `3002` is busy.

## Commands

Run from the repository root unless noted.

```sh
npm install
npm run install:all
cp server/.env.example server/.env
npm run dev
```

Verification:

```sh
npm run check
git diff --check
```

Component commands:

```sh
npm run dev --prefix server
npm run check --prefix server
npm run dev --prefix client
npm run build --prefix client
```

## Environment Files

- `server/.env.example` is committed and documents supported values.
- `server/.env` is local-only and ignored by git.

## Server Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Express API port |
| `HOST` | `127.0.0.1` | Express bind host |
| `TRANSCRIBE_TIMEOUT_MS` | `900000` through example, `15 * 60 * 1000` in code | Kill long-running child pipelines |
| `MAX_UPLOAD_SIZE_GB` | `10` | Multer upload size limit |
| `YTDLP_COMMAND` | `yt-dlp` | URL download command |
| `FFMPEG_COMMAND` | `ffmpeg` | Media conversion command |
| `TRANSCRIPTION_ENGINE` | `openai-whisper` | Default engine when request does not specify one |
| `WHISPER_COMMAND` | `whisper` | OpenAI Whisper CLI command |
| `WHISPER_ARGS` | `{input} --model base --output_format txt --output_dir {outputDir}` | OpenAI Whisper CLI args |
| `MLX_WHISPER_COMMAND` | `mlx_whisper` | MLX Whisper command |
| `MLX_WHISPER_ARGS` | `{input} --model mlx-community/whisper-large-v3-turbo -f txt -o {outputDir}` | MLX Whisper args |
| `OPENAI_API_KEY` | none | Required for `openai` engine |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | OpenAI Audio Transcriptions model |

## External Tools

Required for URL transcription:

- `yt-dlp`
- `ffmpeg`
- One transcription engine command or OpenAI API credentials

Required for video downloads:

- `yt-dlp`

Required for file transcription:

- `ffmpeg`
- One transcription engine command or OpenAI API credentials

Common install commands on macOS:

```sh
brew install yt-dlp ffmpeg
pipx install openai-whisper
pipx install mlx-whisper
```

## Runtime Storage

| Path | Owner | Contents |
| --- | --- | --- |
| `source/` | `pipeline.transcribeFile` | Safe-name copies of uploaded source media |
| `tmp/` | multer and pipeline | Incoming upload temp files, generated WAV files, Whisper output dirs |
| `output/` | pipeline and jobs | Final transcript `.txt` files and `history.json` |
| `downloads/` | video download API | Downloaded YouTube videos |

Only `.gitkeep` files should be committed from these directories.

## API Surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Basic API health response |
| `POST` | `/transcribe/url` | Start URL transcription job |
| `POST` | `/transcribe/file` | Start uploaded file transcription job |
| `GET` | `/transcribe/history` | Return saved history entries |
| `GET` | `/transcribe/jobs/:id/events` | Server-Sent Events stream for job progress |
| `POST` | `/videos/formats` | Return available video download formats |
| `POST` | `/videos/download` | Download selected video format to `downloads/` |

## Progress Stages

URL jobs use:

- `download`
- `transcribe`
- `postprocess`

File jobs use:

- `upload`
- `convert`
- `transcribe`
- `postprocess`

The client renders stage progress from SSE events and estimates elapsed time locally.

## Operational Notes

- If `npm run dev` fails with `EADDRINUSE`, check ports `3001` and `3002`.
- If MLX Whisper fails with `No Metal device available`, run the dev server from a normal macOS terminal session instead of a headless or virtualized session.
- If an external command is not found, either install it or set the corresponding absolute command path in `server/.env`.
- Pipeline stderr is printed to the server process and included in API error messages.
- Express does not hot-reload; restart `npm run dev` after server route changes.
