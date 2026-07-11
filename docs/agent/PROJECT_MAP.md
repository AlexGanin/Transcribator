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
    transcribator.sqlite  Runtime SQLite video/transcript index
    source/       Runtime-копии загруженных source files
    tmp/          Runtime temporary uploads, WAV files и CLI output folders
    output/       Legacy runtime output folder
    artifacts/    Runtime Markdown/screenshot artifacts by video id
    downloads/    Runtime downloaded YouTube videos
    compressed/   Runtime compressed local videos
    obsidian/     Legacy/runtime Obsidian-ready transcript vaults
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
    runtimePaths.ts
    transcriptPersistence.ts
    types.ts
    videoArtifacts.ts
    videoCompression.ts
    videoDownload.ts
    videoLibrary.ts
    videoTranscription.ts
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
  - Для `POST /transcribe/url` автоматически распознает YouTube-ссылки и отправляет их в video library flow, чтобы обычная URL-транскрибация сохранялась в `/videos`.
  - Для `POST /transcribe/file` создает локальную запись в video library flow, чтобы upload-транскрибация тоже появлялась в `/videos`.

- `src/jobs.ts`
  - In-memory job registry и event emitter layer.
  - Асинхронно запускает transcription tasks.
  - Хранит live events для SSE replay.
  - Не пишет результаты в SQLite сам: persistence выполняют task-specific слои вроде `videoTranscription.ts`.

- `src/pipeline.ts`
  - Основной transcription pipeline.
  - Использует `runtime/source/`, `runtime/tmp/` и при включенных скриншотах `runtime/artifacts/<artifact-id>/`.
  - Запускает `yt-dlp`, `ffmpeg`, локальные Whisper engines или OpenAI Audio Transcriptions.
  - Отправляет progress stages в `jobs.ts`.
  - Возвращает raw/clean transcript и список скриншотов вызывающему слою, не сохраняя отдельную историю.

- `src/obsidianNotes.ts`
  - Создает Obsidian-ready vault для транскрибации со скриншотами.
  - Считает `videoHash`: MD5 URL для URL source и MD5 содержимого файла для upload source.
  - Извлекает screenshots через `ffmpeg`, для URL получает video stream через `yt-dlp`.
  - Пишет `runtime/obsidian/<videoHash>/transcript.md`, `screenshots/*.jpg` и `metadata.json`.

- `src/videoDownload.ts`
  - Читает доступные video formats через `yt-dlp --dump-json`.
  - Скачивает выбранные formats в `runtime/downloads/`.

- `src/videoLibrary.ts`
  - Хранит добавленные из YouTube видео, локальные upload-файлы и результаты их транскрибации в единой таблице SQLite `youtube_videos`.
  - Различает записи по `sourceType`: `youtube` для YouTube-роликов и `file` для локальных файлов, сохраненных в `runtime/source/`.
  - Для локальных file-записей задает дефолтный источник/плейлист `Транскрибации` через `channelTitle`.
  - Хранит ручное поле карточки `manualDate`, которое редактируется пользователем и не заполняется автоматически из YouTube metadata или транскрибации.
  - Нормализует YouTube URL до canonical watch URL, дедуплицирует YouTube по `youtubeVideoId`, создает локальные file-записи с синтетическим `youtubeVideoId = file:<id>`, отдает список для CRM `/videos` и детальную карточку `/videos/[id]`.
  - При добавлении YouTube-видео сразу пытается сохранить полную metadata через `yt-dlp --dump-json`; при чтении списка дополнительно дозаполняет старые YouTube-записи без `metadataFetchedAt`.
  - Для YouTube-детальной карточки кэширует metadata из `yt-dlp --dump-json`: описание, длительность, даты, статистику, канал, теги, категории, доступность и форматы; локальные file-записи metadata через `yt-dlp` не обновляют.
  - Удаляет сохраненные записи видеотеки из `youtube_videos` по запросу CRM `/videos`.
  - При старте удаляет legacy-таблицы `transcriptions` и `screenshots`; старые данные истории не мигрируются.

- `src/videoTranscription.ts`
  - Запускает транскрибацию конкретной сохраненной записи video library через `jobs.createJob`.
  - Также умеет стартовать транскрибацию из произвольного URL: YouTube-ссылки добавляются/дедуплицируются в `youtube_videos`, остальные URL остаются transient jobs в `index.ts`.
  - Также умеет стартовать транскрибацию из uploaded file: создает local file-запись, передает ее `id` как `artifactId`, сохраняет transcript и screenshots в этой строке.
  - Переводит строку `youtube_videos` в `processing`, а после `done`/`error` сохраняет тексты, engine, timestamps, screenshots JSON или ошибку.

- `src/videoArtifacts.ts`
  - Редактирует transcript-поля видео, создает Markdown в `runtime/artifacts/<video-id>/transcript.md`.
  - Управляет JSON-индексом скриншотов видео и перемещает файлы между `screenshots/` и `trash/screenshots/`.
  - Сохраняет вручную загруженные превью видео в `runtime/artifacts/<video-id>/thumbnail/` и обновляет `thumbnailUrl` текущей записи.
  - Удаляет runtime artifacts видео и API-owned `runtime/source/` copy локального файла при удалении записи видеотеки.

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
    compress/page.tsx
    download/page.tsx
    globals.css
    layout.tsx
    page.tsx
    videos/[id]/page.tsx
    videos/page.tsx
  next.config.ts
  postcss.config.ts
  src/components/crm-navigation.ts
  src/components/screenshot-lightbox-navigation.ts
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
  - YouTube video backlog на странице `/videos` с сайдбаром каналов, статусом транскрипта и кнопкой «Транскрибировать»
  - удаление записей видеотеки из списка `/videos` через красный крестик с подтверждением
  - локальные file-записи в `/videos` после транскрибации upload-файлов; по умолчанию они группируются в источнике `Транскрибации`
  - детальная карточка `/videos/[id]` с YouTube metadata или local file metadata, ручной загрузкой превью, ручным полем даты карточки, запуском транскрибации, редактированием полей карточки и transcript-полей, Markdown action, галереей скриншотов и корзиной
  - копирование текста `Clean Transcript` из текущего результата и деталки видео
  - video format selection
  - video downloads
  - local video compression

### `apps/extension`

```txt
apps/extension
  entrypoints/
    background.ts
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
- Background service worker хранит defaults extension; popup хранит последний YouTube URL в extension storage.
- Расширение не инжектит плавающую кнопку на YouTube-страницы и не запрашивает YouTube host permission; добавление видео выполняется из popup.
- YouTube helper нормализует ссылки, video id и thumbnail URL для popup action.
- `src/api-base-url.ts` держит дефолт `http://127.0.0.1:2001` и мигрирует старый локальный дефолт `3001`.
- Remote hosted code не используется.

## Пакеты

### `packages/shared`

- Отвечает за Zod API contracts и `z.infer` types.
- Содержит request schemas, response schemas, progress event schemas, engine enum, job status enum, video format/compression DTOs и API error DTOs.
- Не должен импортировать React, Next, Chrome APIs или Node-only APIs.

### `packages/api-client`

- Чистый fetch-based client.
- Работает в Next CRM, extension popup/background и обычных browser contexts.
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
- `runtime/output/`: legacy-каталог; новые транскрипты здесь не сохраняются.
- `runtime/artifacts/`: Markdown, thumbnails, screenshots и trash screenshots для видео по `runtime/artifacts/<video-id>/`.
- `runtime/downloads/`: скачанные YouTube videos.
- `runtime/compressed/`: сжатые локальные video files.
- `runtime/obsidian/`: legacy Obsidian-ready transcript vault folders со скриншотами и metadata.

Из этих директорий в git должны попадать только `.gitkeep` files.

## Data flow

### URL transcription

```txt
CRM root Transcribator
  -> packages/api-client
  -> POST /transcribe/url
  -> shared Zod validation
  -> if URL is YouTube, videoTranscriptionService.adds/deduplicates row in youtube_videos
  -> jobs.createJob
  -> pipeline.transcribeUrl
  -> for YouTube artifactId = youtube_videos.id
  -> yt-dlp stdout
  -> ffmpeg stdin/stdout
  -> selected transcription engine
  -> postProcessTranscript
  -> optional runtime/artifacts/<video-id-or-job-id>/screenshots/
  -> for YouTube, videoLibrary saves rawText, cleanText, formattedText, summary, engine, timestamps, screenshots JSON and status
  -> SSE progress/done events
  -> CRM result panes; YouTube result also appears in CRM /videos
```

### File transcription

```txt
CRM multipart upload
  -> packages/api-client
  -> POST /transcribe/file
  -> shared Zod validation for form fields
  -> multer temp upload
  -> videoTranscriptionService creates sourceType=file row in youtube_videos
  -> default source/channelTitle = "Транскрибации"
  -> runtime/source/<safe_original_filename>
  -> jobs.createJob
  -> pipeline.transcribeFile
  -> artifactId = youtube_videos.id
  -> ffmpeg conversion
  -> selected transcription engine
  -> postProcessTranscript
  -> optional runtime/artifacts/<video-id>/screenshots/
  -> videoLibrary saves rawText, cleanText, formattedText, summary, engine, timestamps, screenshots JSON and status
  -> SSE progress/done events
  -> CRM result panes; local file result also appears in CRM /videos
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

### YouTube video backlog and transcription

```txt
YouTube watch/shorts/live page
  -> apps/extension popup button "Добавить видео"
  -> POST /videos/library
  -> shared Zod validation
  -> videoLibrary.addVideo
  -> API fetches and caches full video metadata through yt-dlp when needed
  -> SQLite youtube_videos unique youtube_video_id
  -> CRM /videos
  -> packages/api-client getYouTubeVideos
  -> GET /videos/library
  -> API enriches saved rows that still have no cached metadata
  -> group loaded videos by channel/uploader in CRM sidebar
  -> list filtered cards with title, channel, thumbnail, status and YouTube link
  -> CRM /videos/[id]
  -> GET /videos/library/:id
  -> videoLibrary.getVideoDetail
  -> fetch missing metadata through yt-dlp --dump-json
  -> cache metadata fields and raw metadata JSON in SQLite
  -> render title, channel, duration, upload date, stats, tags, categories, description and formats
  -> POST /videos/library/:id/metadata refreshes cached metadata on demand
  -> POST /videos/library/:id/transcribe
  -> videoTranscriptionService marks youtube_videos.status = processing
  -> jobs.createJob
  -> pipeline.transcribeUrl with artifactId = video.id
  -> optional runtime/artifacts/<video-id>/screenshots/
  -> videoLibrary saves rawText, cleanText, formattedText, summary, engine, timestamps, screenshots JSON and status
  -> CRM listens to /jobs/:id/events and reloads /videos/library/:id after done/error
  -> PATCH /videos/library/:id/transcript updates editable transcript fields
  -> POST /videos/library/:id/markdown writes runtime/artifacts/<video-id>/transcript.md
```

### Video compression

```txt
CRM local video file
  -> packages/api-client
  -> POST /videos/compress
  -> shared Zod validation for preset
  -> multer temp upload
  -> jobs.createJob
  -> videoCompression.compressVideo
  -> ffprobe duration and dimension metadata
  -> ffmpeg Apple VideoToolbox HEVC/H.265 + AAC compression
  -> runtime/compressed/<safe_original_name-preset-compressed-timestamp>.mp4
  -> SSE progress/done events через /jobs/:id/events
  -> CRM progress, output path и size savings
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
