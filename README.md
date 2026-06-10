# Transcribator

Minimal React + Node.js project for transcribing audio from YouTube links, generic audio/video URLs and local uploads.

## What It Does

- Frontend: React + Vite UI with URL input, file upload, button and result textarea.
- Backend: Express API with `POST /transcribe/url` and `POST /transcribe/file`.
- URL pipeline: `yt-dlp stdout -> ffmpeg stdin`, then Whisper.
- File pipeline: uploaded file is saved to `/source/<original_filename>`, then streamed through `ffmpeg`.
- Results are post-processed and saved to `/output/<timestamp>.txt`.
- Local upload limit defaults to 10 GiB and can be changed with `MAX_UPLOAD_SIZE_GB`.

## Important Whisper Note

The requested ideal pipeline is:

```sh
yt-dlp -f bestaudio -o - <URL> | ffmpeg -i pipe:0 -f wav pipe:1 | whisper
```

`yt-dlp -> ffmpeg` is implemented as real Node.js streams with `child_process.spawn`.

Most common local Whisper CLIs, including the Python `openai-whisper` command, do **not** reliably accept WAV data from stdin. Because of that, the default runnable mode streams ffmpeg output into a temporary WAV file and then passes the file path to Whisper. No audio is buffered fully in Node.js memory.

If your Whisper engine supports stdin, set:

```env
TRANSCRIPTION_ENGINE=local-stdin
WHISPER_COMMAND=whisper-cli
WHISPER_ARGS=-f - -otxt
```

Then the backend connects:

```txt
yt-dlp stdout -> ffmpeg stdin -> ffmpeg stdout -> whisper stdin
```

## Transcription Engines

The UI has a `Transcription engine` selector. The backend receives the selected engine per request, so you can switch implementations without changing the pipeline code.

Available engines:

- `mlx-whisper`: local MLX Whisper for Apple Silicon GPU/Metal acceleration.
- `openai-whisper`: local OpenAI Whisper CLI. This is the original CPU-oriented fallback.
- `openai`: OpenAI Audio Transcriptions API.

Local `.env` example:

```env
TRANSCRIPTION_ENGINE=openai-whisper
WHISPER_COMMAND=/Users/your-user/.local/bin/whisper
WHISPER_ARGS={input} --model base --output_format txt --output_dir {outputDir}

MLX_WHISPER_COMMAND=/Users/your-user/.local/bin/mlx_whisper
MLX_WHISPER_ARGS={input} --model mlx-community/whisper-large-v3-turbo -f txt -o {outputDir}
```

Install MLX Whisper:

```sh
pipx install mlx-whisper
```

MLX Whisper needs an Apple Silicon Mac with accessible Metal GPU. If it is launched from a headless, sandboxed or virtualized session, it may fail with `No Metal device available`; in that case, run the dev server from a normal macOS terminal session.

## System Requirements

Install these system tools and make sure they are available in `PATH`:

- Node.js `^20.19.0` or `>=22.12.0` (required by the current Vite dependency)
- `yt-dlp`
- `ffmpeg`
- Local Whisper CLI, for example `whisper`, `whisper-cli` or another compatible command

Examples:

```sh
brew install yt-dlp ffmpeg
```

For local Whisper, choose one:

```sh
pipx install openai-whisper
```

or install/build `whisper.cpp` and expose its CLI as `whisper-cli`.

Python is not used by this Node.js app directly. It may be required by the external `openai-whisper` CLI.

## Optional OpenAI Fallback

If local Whisper is not available, you can use OpenAI Audio Transcriptions:

```env
TRANSCRIPTION_ENGINE=openai
OPENAI_API_KEY=sk-...
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

This fallback sends the temporary WAV file to the OpenAI API. It is not a pure local transcription path.

## Install

```sh
npm install
npm run install:all
cp server/.env.example server/.env
```

Edit `server/.env` if your Whisper command or args are different.

## Run

```sh
npm run dev
```

Open:

```txt
http://localhost:5173
```

Backend:

```txt
http://localhost:3001
```

## API

### `POST /transcribe/url`

Body:

```json
{
  "url": "https://www.youtube.com/watch?v=..."
}
```

### `POST /transcribe/file`

Multipart form-data:

```txt
file=<audio_or_video_file>
```

## Project Structure

```txt
project-root
  client
    src
      main.jsx
      styles.css
    index.html
    package.json
  server
    src
      index.js
      pipeline.js
      postProcess.js
    .env.example
    package.json
  source
  output
  tmp
  package.json
  README.md
```

## Error Handling

The server checks for required commands before running the pipeline:

- URL transcription requires `yt-dlp` and `ffmpeg`.
- File transcription requires `ffmpeg`.
- Local Whisper mode requires `WHISPER_COMMAND`.

Pipeline stderr is logged and included in server errors. Long-running jobs are killed after `TRANSCRIBE_TIMEOUT_MS`, which defaults to 15 minutes.

## Post-processing

The included post-processing is a simple local heuristic:

- removes common noise tags like `[music]`
- collapses repeated words
- normalizes spacing and punctuation
- groups text into short paragraphs

LLM post-processing is intentionally not enabled by default. It can be added as an optional step after transcription if you want higher-quality punctuation and correction.
