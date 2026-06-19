# Transcribator

Локальный pnpm workspace для транскрибации медиа, хранения истории транскрибаций и скачивания YouTube-видео.

## Что умеет проект

- `apps/crm`: CRM на Next.js App Router по адресу `http://localhost:3002`.
- `apps/api`: Express API на TypeScript по адресу `http://localhost:3001`.
- `apps/extension`: каркас Chrome extension на WXT, React и Manifest V3.
- `packages/shared`: Zod-контракты API, DTO и общие типы.
- `packages/api-client`: fetch-клиент, который используют CRM и extension.
- `packages/ui`: shadcn-style React UI primitives на Tailwind и Radix, плюс Storybook UI Kit.

Express API отвечает за всю транскрибацию и видео-логику: `yt-dlp`, `ffmpeg`, Whisper-движки, uploads, Server-Sent Events, историю и скачивания.

## Системные требования

- Node.js `24.x`
- pnpm `11.x` через Corepack
- `yt-dlp`
- `ffmpeg`
- локальный Whisper CLI, MLX Whisper или OpenAI API credentials

Обычная установка на macOS:

```sh
brew install yt-dlp ffmpeg
pipx install openai-whisper
pipx install mlx-whisper
```

## Установка

```sh
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
```

Отредактируй `apps/api/.env`, если локальные пути к командам или аргументы Whisper отличаются.

## Запуск

```sh
pnpm dev
```

Открыть:

```txt
http://localhost:3002
```

API:

```txt
http://localhost:3001
```

Runtime-файлы пишутся в корневую папку `runtime/`:

- `runtime/transcribator.sqlite`: основной SQLite-индекс транскрибаций и скриншотов
- `runtime/source/`: копии загруженных исходных медиа
- `runtime/tmp/`: uploads, WAV-файлы и папки вывода Whisper
- `runtime/output/`: legacy `history.json` для одноразовой миграции старых записей
- `runtime/artifacts/`: Markdown-артефакты и screenshots/trash для записей истории
- `runtime/downloads/`: скачанные видео
- `runtime/compressed/`: сжатые локальные видео
- `runtime/obsidian/`: legacy Obsidian-ready заметки старых записей

## Команды

Основные команды:

```sh
pnpm dev
pnpm build
pnpm typecheck
pnpm check
```

UI Kit на Storybook:

```sh
pnpm storybook
pnpm build-storybook
```

Storybook открывается на `http://localhost:6006`.

Отдельный workspace-пакет можно запустить через `--filter`, например:

```sh
pnpm --filter @transcribator/api dev
pnpm --filter @transcribator/crm dev
pnpm --filter @transcribator/extension dev
pnpm --filter @transcribator/ui storybook
```

## Движки транскрибации

CRM и extension отправляют выбранный движок в каждом запросе. Поддерживаемые значения описаны в `packages/shared`:

- `mlx-whisper`: локальный MLX Whisper для Apple Silicon GPU/Metal acceleration.
- `openai-whisper`: локальный OpenAI Whisper CLI.
- `openai`: OpenAI Audio Transcriptions API.
- `local-stdin`: локальная Whisper-команда с поддержкой stdin.

Пример значений в `apps/api/.env`:

```env
TRANSCRIPTION_ENGINE=openai-whisper
WHISPER_COMMAND=/Users/your-user/.local/bin/whisper
WHISPER_ARGS={input} --model base --language ru --condition_on_previous_text False --word_timestamps True --hallucination_silence_threshold 2 --clip_timestamps {clipTimestamps} --output_format txt --output_dir {outputDir}

MLX_WHISPER_COMMAND=/Users/your-user/.local/bin/mlx_whisper
MLX_WHISPER_ARGS={input} --model mlx-community/whisper-large-v3-turbo --language ru --condition-on-previous-text False --word-timestamps True --hallucination-silence-threshold 2 --clip-timestamps {clipTimestamps} -f txt -o {outputDir}
```

OpenAI API fallback:

```env
TRANSCRIPTION_ENGINE=openai
OPENAI_API_KEY=sk-...
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

## API

Все контракты запросов и ответов лежат в `packages/shared`.

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/health` | Health-check API |
| `POST` | `/transcribe/url` | Запустить транскрибацию URL |
| `POST` | `/transcribe/file` | Запустить транскрибацию загруженного файла |
| `GET` | `/transcribe/history` | Прочитать сохраненную историю |
| `GET` | `/transcribe/history/:id` | Прочитать деталку записи из SQLite |
| `PATCH` | `/transcribe/history/:id` | Обновить редактируемые поля записи |
| `POST` | `/transcribe/history/:id/format` | Запустить placeholder-нейроформатирование |
| `POST` | `/transcribe/history/:id/markdown` | Создать `runtime/artifacts/<id>/transcript.md` |
| `GET` | `/transcribe/jobs/:id/events` | SSE-поток прогресса |
| `GET` | `/jobs/:id/events` | Нейтральный SSE-поток прогресса job |
| `POST` | `/videos/formats` | Получить доступные форматы видео |
| `POST` | `/videos/download` | Скачать выбранный формат в `runtime/downloads/` |
| `POST` | `/videos/compress` | Сжать локальный видеофайл в `runtime/compressed/` |

Для `/transcribe/url` и `/transcribe/file` можно передать `screenshotsEnabled=true` и `screenshotIntervalSeconds=30`.
Тогда API создает скриншоты в `runtime/artifacts/<transcription-id>/screenshots/`.
Markdown больше не создается автоматически: его нужно создать отдельной кнопкой в истории, и он собирается из данных SQLite.

## Структура проекта

```txt
apps/
  api/          Express API и media pipeline
  crm/          Next.js CRM UI
  extension/    WXT React Chrome extension
packages/
  api-client/   fetch-клиент для API-вызовов
  shared/       Zod-схемы и общие типы
  ui/           общие shadcn-style UI-компоненты и Storybook
runtime/
  transcribator.sqlite
  source/
  tmp/
  output/
  artifacts/
  downloads/
  compressed/
  obsidian/
docs/agent/
```

Агентская документация проекта лежит в `docs/agent/`.
