# Video Download Tab Design

## Goal

Add a second app tab, `Скачать видео`, where a user can paste a YouTube URL, inspect available video download formats, choose a quality, and save the downloaded video into a project runtime directory.

## Scope

- Keep the existing transcription workflow unchanged in the `Транскрибатор` tab.
- Add a server-side video download flow based on the existing `yt-dlp` command configuration.
- Save downloaded videos into `downloads/` at the project root.
- Ignore downloaded video files in git while keeping `downloads/.gitkeep`.
- Update human and agent documentation.

## Architecture

The client remains a React + Vite app. `client/src/main.jsx` gains an `activeTab` state and renders either the current transcription UI or the new video download UI.

The server gains a focused `server/src/videoDownload.js` module. It validates URLs, reads available formats from `yt-dlp --dump-json`, normalizes them for UI display, and downloads a selected format with `yt-dlp`.

The Express app exposes:

- `POST /videos/formats`
- `POST /videos/download`

## Download Directory

Downloaded videos are saved under:

```txt
downloads/
```

This keeps media output separate from transcript output in `output/`.

## UX

The `Скачать видео` tab includes:

- YouTube URL input.
- `Получить варианты` button.
- Format selector with quality, extension, fps, and estimated size where available.
- `Скачать` button.
- Status, error, and saved path messages.

## Verification

- Server unit tests for format normalization and safe filename handling.
- `npm run check --prefix server`.
- `npm run build --prefix client`.
- `npm run check`.
- `git diff --check`.
