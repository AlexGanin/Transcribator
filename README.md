# Transcribator

Локальный pnpm workspace для транскрибации медиа, хранения истории транскрибаций и скачивания YouTube-видео.

## Что умеет проект

- `apps/crm`: CRM на Next.js App Router по адресу `http://localhost:3002`.
- `apps/api`: Express API по адресу `http://localhost:3001`.
- `apps/extension`: каркас Chrome extension на WXT, React и Manifest V3.
- `packages/shared`: Zod-контракты API, DTO и общие типы.
- `packages/api-client`: fetch-клиент, который используют CRM и extension.
- `packages/ui`: shadcn-style React UI primitives на Tailwind и Radix, плюс Storybook UI Kit.

Express API отвечает за всю транскрибацию и видео-логику: `yt-dlp`, `ffmpeg`, Whisper-движки, uploads, Server-Sent Events, историю и скачивания.

## Системные требования

- Node.js `^20.19.0` или `>=22.12.0`
- pnpm через Corepack
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

Runtime-файлы пишутся в корневые папки:

- `source/`: копии загруженных исходных медиа
- `tmp/`: uploads, WAV-файлы и папки вывода Whisper
- `output/`: транскрипты и `history.json`
- `downloads/`: скачанные видео

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
WHISPER_ARGS={input} --model base --output_format txt --output_dir {outputDir}

MLX_WHISPER_COMMAND=/Users/your-user/.local/bin/mlx_whisper
MLX_WHISPER_ARGS={input} --model mlx-community/whisper-large-v3-turbo -f txt -o {outputDir}
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
| `GET` | `/transcribe/jobs/:id/events` | SSE-поток прогресса |
| `POST` | `/videos/formats` | Получить доступные форматы видео |
| `POST` | `/videos/download` | Скачать выбранный формат в `downloads/` |

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
source/
tmp/
output/
downloads/
docs/agent/
```

Агентская документация проекта лежит в `docs/agent/`.
