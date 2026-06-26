# Карта проекта

Этот файл описывает текущую структуру репозитория и ответственность каждой важной области.

## Верхнеуровневая структура

```txt
Transcribator
  apps/
    api/          Express API и transcription/video pipeline
    crm/          Next.js App Router CRM
    extension/    WXT React Chrome extension
  packages/
    api-client/   fetch-based API client
    shared/       Zod schemas, DTOs и общие types
    ui/           общие shadcn-style React components и Storybook UI Kit
  runtime/
    transcribator.sqlite  Runtime SQLite history index
    source/       Runtime-копии загруженных source files
    tmp/          Runtime temporary uploads, WAV files и CLI output folders
    output/       Runtime transcript files и history.json
    artifacts/    Runtime Markdown/screenshot artifacts by transcription id
    downloads/    Runtime downloaded YouTube videos
    compressed/   Runtime compressed local videos
    obsidian/     Runtime Obsidian-ready transcript vaults
  docs/agent/     Агентская документация проекта
  package.json    Корневые pnpm workspace commands
  pnpm-lock.yaml  Workspace lockfile
```

## Корневые файлы

- `package.json`
  - Отвечает за корневые команды `dev`, `build`, `typecheck`, `check`, `storybook` и `build-storybook`.
  - Запускает Express API и Next CRM вместе для локальной разработки.

- `pnpm-workspace.yaml`
  - Подключает `apps/*` и `packages/*`.

- `tsconfig.base.json`
  - Общие строгие TypeScript-настройки для новых apps и packages.

- `.gitignore`
  - Игнорирует dependency folders, Next/WXT build output, app/package `dist/` folders и runtime output в `runtime/`, кроме `.gitkeep` files.

- `README.md`
  - Пользовательский обзор проекта, установка, запуск, API и архитектурные заметки.

## Приложения

### `apps/api`

```txt
apps/api
  .env.example
  package.json
  tsconfig.json
  src
    errors.ts
    index.ts
    jobs.ts
    obsidianNotes.ts
    pipeline.ts
    postProcess.ts
    types.ts
    videoCompression.ts
    videoDownload.ts
    videoLibrary.ts
```

- `tsconfig.json`
  - Наследует корневый `tsconfig.base.json`.
  - Использует `module` и `moduleResolution` `NodeNext`, `rootDir` `src`, `outDir` `dist` и Node types.

- `src/index.ts`
  - Entry point Express app.
  - Загружает `apps/api/.env`.
  - Биндится к `HOST` и `PORT`, по умолчанию `127.0.0.1:2001`.
  - Настраивает CORS, JSON parsing, multer uploads, route handlers, SSE и error handling.
  - Валидирует request bodies схемами из `@transcribator/shared`.

- `src/jobs.ts`
  - In-memory job registry и event emitter layer.
  - Асинхронно запускает transcription tasks.
  - Хранит live events для SSE replay.
  - Пишет историю запусков в `runtime/output/history.json`.

- `src/pipeline.ts`
  - Основной transcription pipeline.
  - Использует `runtime/source/`, `runtime/tmp/`, `runtime/output/` и при включенных скриншотах `runtime/obsidian/`.
  - Запускает `yt-dlp`, `ffmpeg`, локальные Whisper engines или OpenAI Audio Transcriptions.
  - Отправляет progress stages в `jobs.ts`.

- `src/obsidianNotes.ts`
  - Создает Obsidian-ready vault для транскрибации со скриншотами.
  - Считает `videoHash`: MD5 URL для URL source и MD5 содержимого файла для upload source.
  - Извлекает screenshots через `ffmpeg`, для URL получает video stream через `yt-dlp`.
  - Пишет `runtime/obsidian/<videoHash>/transcript.md`, `screenshots/*.jpg` и `metadata.json`.

- `src/videoDownload.ts`
  - Читает доступные video formats через `yt-dlp --dump-json`.
  - Скачивает выбранные formats в `runtime/downloads/`.

- `src/videoLibrary.ts`
  - Хранит добавленные из YouTube видео в таблице SQLite `youtube_videos`.
  - Нормализует YouTube URL до canonical watch URL, дедуплицирует по `youtubeVideoId`, отдает список для CRM `/videos` и детальную карточку `/videos/[id]`.
  - Для детальной карточки кэширует metadata из `yt-dlp --dump-json`: описание, длительность, даты, статистику, канал, теги, категории, доступность и форматы.

- `src/videoCompression.ts`
  - Сжимает один локальный видеофайл через `ffprobe` и `ffmpeg`.
  - Пишет результат в `runtime/compressed/`.
  - Использует Apple VideoToolbox HEVC/H.265 + AAC presets и отдает реальный progress по длительности видео.

- `src/errors.ts`
  - Содержит `HttpError` с `statusCode` и guard для error middleware.

- `src/types.ts`
  - Содержит API runtime-типы: `Job`, `JobMetadata`, progress handlers, transcription options, child process metadata и yt-dlp metadata shapes.

### `apps/crm`

```txt
apps/crm
  app/
    videos/[id]/page.tsx
    videos/page.tsx
    globals.css
    layout.tsx
    page.tsx
  next.config.ts
  postcss.config.ts
  src/components/history-delete.ts
  src/components/transcribator-app.tsx
```

- Next.js App Router TypeScript app.
- Запускается на `127.0.0.1:2000`.
- Использует `@transcribator/api-client` для каждого API-вызова.
- Использует `@transcribator/ui` для общих controls.
- Реализует:
  - URL transcription
  - file transcription
  - transcription engine selection
  - SSE progress
  - transcription history
  - YouTube video backlog на странице `/videos` и детальная карточка `/videos/[id]`
  - удаление записей истории с подтверждением
  - копирование текста `Clean Transcript` из текущего результата и деталки истории
  - video format selection
  - video downloads
  - local video compression

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
  src/
    api-base-url.ts
    youtube-video.ts
  wxt.config.ts
```

- WXT + React + TypeScript Manifest V3 extension.
- Popup использует `@transcribator/api-client` и содержит отдельную кнопку «Добавить видео» для сохранения текущего YouTube-ролика в backlog без запуска транскрибации.
- Background service worker хранит defaults extension и последний YouTube URL.
- YouTube content script использует Shadow DOM style isolation.
- YouTube content script показывает кнопку «Добавить видео» на video/shorts/live страницах, проверяет `/videos/library/check` и добавляет видео через `/videos/library`.
- `src/api-base-url.ts` держит дефолт `http://127.0.0.1:2001` и мигрирует старый локальный дефолт `3001`.
- Remote hosted code не используется.

## Пакеты

### `packages/shared`

- Отвечает за Zod API contracts и `z.infer` types.
- Содержит request schemas, response schemas, progress event schemas, engine enum, job status enum, video format/compression DTOs и API error DTOs.
- Не должен импортировать React, Next, Chrome APIs или Node-only APIs.

### `packages/api-client`

- Чистый fetch-based client.
- Работает в Next CRM, extension popup/background/content scripts и обычных browser contexts.
- Импортирует и валидирует данные схемами из `packages/shared`.
- Нормализует failed responses в `ApiClientError`.
- Не должен импортировать React, TanStack Query, Next APIs, Chrome APIs или Node-only APIs.

### `packages/ui`

- Общие React components, стилизованные Tailwind classes и Radix primitives.
- Содержит Button, Input, Textarea, Select, Tabs, Progress, Badge и Card primitives.
- Каждый компонент лежит в отдельной папке `src/components/<component>/index.tsx`, чтобы рядом можно было хранить stories, notes и component-local files.
- Storybook живет внутри пакета: `.storybook/`, `src/storybook.css`, component stories рядом с `index.tsx` и `src/stories/patterns.stories.tsx`.
- Root command `pnpm storybook` запускает `@transcribator/ui` Storybook на `http://127.0.0.1:2002`.
- Должен оставаться framework-agnostic: без Next APIs, Chrome APIs или Node APIs.

## Runtime-директории

- `runtime/source/`: safe-name copies загруженных source files.
- `runtime/tmp/`: multer uploads, generated WAV files и Whisper output folders.
- `runtime/output/`: legacy `history.json` для одноразовой миграции старых записей.
- `runtime/artifacts/`: Markdown, screenshots и trash screenshots для записей истории; удаление истории удаляет папку `runtime/artifacts/<transcription-id>/`.
- `runtime/downloads/`: скачанные YouTube videos.
- `runtime/compressed/`: сжатые локальные video files.
- `runtime/obsidian/`: Obsidian-ready transcript vault folders со скриншотами и metadata.

Из этих директорий в git должны попадать только `.gitkeep` files.

## Data flow

### URL transcription

```txt
CRM или extension
  -> packages/api-client
  -> POST /transcribe/url
  -> shared Zod validation
  -> jobs.createJob
  -> pipeline.transcribeUrl
  -> yt-dlp stdout
  -> ffmpeg stdin/stdout
  -> selected transcription engine
  -> postProcessTranscript + summarizeTranscript
  -> runtime/output/<timestamp>.txt
  -> optional runtime/obsidian/<videoHash>/transcript.md
  -> runtime/output/history.json
  -> SSE progress/done events
  -> CRM result panes и history
```

### File transcription

```txt
CRM multipart upload
  -> packages/api-client
  -> POST /transcribe/file
  -> shared Zod validation for form fields
  -> multer temp upload
  -> runtime/source/<safe_original_filename>
  -> jobs.createJob
  -> pipeline.transcribeFile
  -> ffmpeg conversion
  -> selected transcription engine
  -> runtime/output/<timestamp>.txt
  -> optional runtime/obsidian/<videoHash>/transcript.md
  -> runtime/output/history.json
  -> SSE progress/done events
```

### Obsidian export для транскрибации

```txt
Transcription request with screenshotsEnabled=true
  -> shared Zod validation for screenshotsEnabled and screenshotIntervalSeconds
  -> pipeline.finalizeTranscript
  -> obsidianNotes.createObsidianVault
  -> runtime/obsidian/<videoHash>/
  -> screenshots/0001-00-00-30.jpg
  -> transcript.md with ![[screenshots/file.jpg]] embeds
  -> metadata.json with future AI selection placeholders
  -> result/history markdownPath, obsidianFolderPath, screenshotsCount
```

### Video download

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
  -> runtime/downloads/<safe_title-formatId>.<ext>
```

### YouTube video backlog

```txt
YouTube watch/shorts/live page
  -> apps/extension content script Shadow DOM button
  -> GET /videos/library/check?url=<canonical-youtube-url>
  -> button state: Добавить или Добавлено
  -> POST /videos/library
  -> shared Zod validation
  -> videoLibrary.addVideo
  -> SQLite youtube_videos unique youtube_video_id
  -> CRM /videos
  -> packages/api-client getYouTubeVideos
  -> GET /videos/library
  -> list cards with title, channel, thumbnail, status and YouTube link
  -> CRM /videos/[id]
  -> GET /videos/library/:id
  -> videoLibrary.getVideoDetail
  -> fetch missing metadata through yt-dlp --dump-json
  -> cache metadata fields and raw metadata JSON in SQLite
  -> render title, channel, duration, upload date, stats, tags, categories, description and formats
  -> POST /videos/library/:id/metadata refreshes cached metadata on demand
```

### Video compression

```txt
CRM local video file
  -> packages/api-client
  -> POST /videos/compress
  -> shared Zod validation for preset
  -> multer temp upload
  -> jobs.createJob with persistHistory: false
  -> videoCompression.compressVideo
  -> ffprobe duration and dimension metadata
  -> ffmpeg Apple VideoToolbox HEVC/H.265 + AAC compression
  -> runtime/compressed/<safe_original_name-preset-compressed-timestamp>.mp4
  -> SSE progress/done events через /jobs/:id/events
  -> CRM progress, output path и size savings
```

### History deletion

```txt
CRM history list или detail
  -> window.confirm
  -> packages/api-client
  -> DELETE /transcribe/history/:id
  -> historyDetailsService.deleteEntry
  -> SQLite transcriptions row delete with screenshots cascade
  -> remove runtime/artifacts/<transcription-id>/
  -> keep runtime/source/ files untouched
  -> CRM refreshes history list or returns from detail to /history
```

## Generated и локальные файлы

Не коммить эти файлы, если политика проекта явно не изменилась:

- `node_modules/`
- `apps/crm/.next/`
- `apps/extension/.wxt/`
- `apps/extension/.output/`
- `apps/*/dist/`
- `packages/*/dist/`
- `packages/*/storybook-static/`
- Runtime contents в `runtime/downloads/`, `runtime/source/`, `runtime/tmp/`, `runtime/output/`, `runtime/artifacts/`, `runtime/compressed/`, `runtime/obsidian/`, кроме `.gitkeep`
- Любой `.env` file
