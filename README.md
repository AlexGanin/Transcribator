# Transcribator

Local pnpm workspace for transcribing media, tracking transcription history and downloading YouTube videos.

## What It Does

- `apps/crm`: Next.js App Router CRM at `http://localhost:3002`.
- `apps/api`: Express API at `http://localhost:3001`.
- `apps/extension`: Chrome extension scaffold built with WXT, React and Manifest V3.
- `packages/shared`: Zod API contracts, DTOs and shared types.
- `packages/api-client`: fetch-based client used by the CRM and extension.
- `packages/ui`: shadcn-style React UI primitives built on Tailwind and Radix.

The Express API owns the transcription and video logic: `yt-dlp`, `ffmpeg`, Whisper engines, uploads, Server-Sent Events, history and downloads.

## System Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- pnpm through Corepack
- `yt-dlp`
- `ffmpeg`
- A local Whisper CLI, MLX Whisper, or OpenAI API credentials

Common macOS setup:

```sh
brew install yt-dlp ffmpeg
pipx install openai-whisper
pipx install mlx-whisper
```

## Install

```sh
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` if your local command paths or Whisper arguments are different.

## Run

```sh
pnpm dev
```

Open:

```txt
http://localhost:3002
```

API:

```txt
http://localhost:3001
```

Runtime files are written to root-level folders:

- `source/`: uploaded source media copies
- `tmp/`: uploads, WAV files and Whisper output folders
- `output/`: transcripts and `history.json`
- `downloads/`: downloaded videos

## Commands

Only these command categories are used:

```sh
pnpm dev
pnpm build
pnpm typecheck
pnpm check
```

Run an individual workspace package with `--filter`, for example:

```sh
pnpm --filter @transcribator/api dev
pnpm --filter @transcribator/crm dev
pnpm --filter @transcribator/extension dev
```

## Transcription Engines

The CRM and extension send the selected engine per request. Supported values are defined in `packages/shared`:

- `mlx-whisper`: local MLX Whisper for Apple Silicon GPU/Metal acceleration.
- `openai-whisper`: local OpenAI Whisper CLI.
- `openai`: OpenAI Audio Transcriptions API.
- `local-stdin`: stdin-capable local Whisper command.

Example `apps/api/.env` values:

```env
TRANSCRIPTION_ENGINE=openai-whisper
WHISPER_COMMAND=/Users/your-user/.local/bin/whisper
WHISPER_ARGS={input} --model base --output_format txt --output_dir {outputDir}

MLX_WHISPER_COMMAND=/Users/your-user/.local/bin/mlx_whisper
MLX_WHISPER_ARGS={input} --model mlx-community/whisper-large-v3-turbo -f txt -o {outputDir}
```

For OpenAI API fallback:

```env
TRANSCRIPTION_ENGINE=openai
OPENAI_API_KEY=sk-...
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

## API

All request and response contracts live in `packages/shared`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API health |
| `POST` | `/transcribe/url` | Start URL transcription |
| `POST` | `/transcribe/file` | Start uploaded file transcription |
| `GET` | `/transcribe/history` | Read saved history |
| `GET` | `/transcribe/jobs/:id/events` | SSE progress stream |
| `POST` | `/videos/formats` | List available video formats |
| `POST` | `/videos/download` | Download selected format to `downloads/` |

## Project Structure

```txt
apps/
  api/          Express API and media pipeline
  crm/          Next.js CRM UI
  extension/    WXT React Chrome extension
packages/
  api-client/   fetch client for API calls
  shared/       Zod schemas and shared types
  ui/           shared shadcn-style UI components
source/
tmp/
output/
downloads/
docs/agent/
```

Agent-facing project knowledge lives in `docs/agent/`.
