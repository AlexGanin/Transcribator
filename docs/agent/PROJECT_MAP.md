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
    ui/           общие shadcn-style React components
  source/         Runtime-копии загруженных source files
  tmp/            Runtime temporary uploads, WAV files и CLI output folders
  output/         Runtime transcript files и history.json
  downloads/      Runtime downloaded YouTube videos
  docs/agent/     Агентская документация проекта
  package.json    Корневые pnpm workspace commands
  pnpm-lock.yaml  Workspace lockfile
```

## Корневые файлы

- `package.json`
  - Отвечает за корневые команды `dev`, `build`, `typecheck` и `check`.
  - Запускает Express API и Next CRM вместе для локальной разработки.

- `pnpm-workspace.yaml`
  - Подключает `apps/*` и `packages/*`.

- `tsconfig.base.json`
  - Общие строгие TypeScript-настройки для новых apps и packages.

- `.gitignore`
  - Игнорирует dependency folders, Next/WXT build output, package `dist/` folders и runtime output в `downloads/`, `source/`, `output/`, `tmp/`.

- `README.md`
  - Пользовательский обзор проекта, установка, запуск, API и архитектурные заметки.

## Приложения

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
  - Entry point Express app.
  - Загружает `apps/api/.env`.
  - Биндится к `HOST` и `PORT`, по умолчанию `127.0.0.1:3001`.
  - Настраивает CORS, JSON parsing, multer uploads, route handlers, SSE и error handling.
  - Валидирует request bodies схемами из `@transcribator/shared`.

- `src/jobs.js`
  - In-memory job registry и event emitter layer.
  - Асинхронно запускает transcription tasks.
  - Хранит live events для SSE replay.
  - Пишет историю запусков в корневой `output/history.json`.

- `src/pipeline.js`
  - Основной transcription pipeline.
  - Использует корневые `source/`, `tmp/` и `output/`.
  - Запускает `yt-dlp`, `ffmpeg`, локальные Whisper engines или OpenAI Audio Transcriptions.
  - Отправляет progress stages в `jobs.js`.

- `src/videoDownload.js`
  - Читает доступные video formats через `yt-dlp --dump-json`.
  - Скачивает выбранные formats в корневую `downloads/`.

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
- Запускается на `127.0.0.1:3002`.
- Использует `@transcribator/api-client` для каждого API-вызова.
- Использует `@transcribator/ui` для общих controls.
- Реализует:
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
- Popup использует `@transcribator/api-client`.
- Background service worker хранит defaults extension и последний YouTube URL.
- YouTube content script использует Shadow DOM style isolation.
- Remote hosted code не используется.

## Пакеты

### `packages/shared`

- Отвечает за Zod API contracts и `z.infer` types.
- Содержит request schemas, response schemas, progress event schemas, engine enum, job status enum, video format DTOs и API error DTOs.
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
- Должен оставаться framework-agnostic: без Next APIs, Chrome APIs или Node APIs.

## Runtime-директории

- `source/`: safe-name copies загруженных source files.
- `tmp/`: multer uploads, generated WAV files и Whisper output folders.
- `output/`: итоговые transcript `.txt` files и `history.json`.
- `downloads/`: скачанные YouTube videos.

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
  -> output/<timestamp>.txt
  -> output/history.json
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
  -> source/<safe_original_filename>
  -> jobs.createJob
  -> pipeline.transcribeFile
  -> ffmpeg conversion
  -> selected transcription engine
  -> output/<timestamp>.txt
  -> output/history.json
  -> SSE progress/done events
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
  -> downloads/<safe_title-formatId>.<ext>
```

## Generated и локальные файлы

Не коммить эти файлы, если политика проекта явно не изменилась:

- `node_modules/`
- `apps/crm/.next/`
- `apps/extension/.wxt/`
- `apps/extension/.output/`
- `packages/*/dist/`
- Runtime contents в `downloads/`, `source/`, `tmp/`, `output/`
- Любой `.env` file
