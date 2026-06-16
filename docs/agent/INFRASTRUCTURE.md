# Infrastructure

This file documents local runtime infrastructure, commands, ports, environment variables and external dependencies.

## Runtime Model

Transcribator runs as a pnpm workspace with two local development processes by default:

- CRM: Next.js dev server at `http://localhost:3002`.
- API: Express server at `http://localhost:3001`.

The Chrome extension is developed separately with WXT when needed.

## Ports

| Service | Default | Source |
| --- | --- | --- |
| CRM UI | `127.0.0.1:3002` | `apps/crm/package.json` |
| API | `127.0.0.1:3001` | `apps/api/src/index.js`, overridable by `apps/api/.env` |

The CRM uses `NEXT_PUBLIC_API_BASE_URL` when provided, otherwise `http://localhost:3001`.
The extension uses `VITE_API_BASE_URL` when provided, otherwise `http://localhost:3001`.

## Commands

Run from the repository root unless noted.

```sh
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Verification:

```sh
pnpm typecheck
pnpm build
pnpm check
git diff --check
```

Component commands:

```sh
pnpm --filter @transcribator/api dev
pnpm --filter @transcribator/crm dev
pnpm --filter @transcribator/extension dev
```

## Environment Files

- `apps/api/.env.example` is committed and documents supported API values.
- `apps/api/.env` is local-only and ignored by git.
- `.env` files are ignored throughout the workspace.

## API Environment Variables

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
| `source/` | `apps/api/src/pipeline.js` | Safe-name copies of uploaded source media |
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

Request and response schemas live in `packages/shared`.

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

The CRM renders stage progress from SSE events and estimates elapsed time locally.

## Operational Notes

- If `pnpm dev` fails with `EADDRINUSE`, check ports `3001` and `3002`.
- If MLX Whisper fails with `No Metal device available`, run the dev server from a normal macOS terminal session instead of a headless or virtualized session.
- If an external command is not found, either install it or set the corresponding absolute command path in `apps/api/.env`.
- Pipeline stderr is printed to the API process and included in API error messages.
- Express does not hot-reload; restart `pnpm dev` after API route changes.
