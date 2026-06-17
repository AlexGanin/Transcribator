# Инфраструктура

Этот файл описывает локальную runtime-инфраструктуру, команды, порты, переменные окружения и внешние зависимости.

## Runtime model

Transcribator запускается как pnpm workspace. По умолчанию локальная разработка состоит из двух процессов:

- CRM: Next.js dev server на `http://localhost:3002`.
- API: Express server на `http://localhost:3001`.

Chrome extension при необходимости разрабатывается отдельно через WXT.
Storybook для `packages/ui` запускается отдельно на `http://localhost:6006`.

## Порты

| Сервис | По умолчанию | Источник |
| --- | --- | --- |
| CRM UI | `127.0.0.1:3002` | `apps/crm/package.json` |
| API | `127.0.0.1:3001` | `apps/api/src/index.ts`, можно переопределить через `apps/api/.env` |
| Storybook UI Kit | `127.0.0.1:6006` | `packages/ui/package.json` |

CRM использует `NEXT_PUBLIC_API_BASE_URL`, если переменная задана, иначе `http://localhost:3001`.
Extension использует `VITE_API_BASE_URL`, если переменная задана, иначе `http://localhost:3001`.

## Команды

Запускай из корня репозитория, если не указано иначе.

```sh
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Проверка:

```sh
pnpm typecheck
pnpm build
pnpm check
pnpm storybook
pnpm build-storybook
git diff --check
```

Команды отдельных компонентов:

```sh
pnpm --filter @transcribator/api dev
pnpm --filter @transcribator/crm dev
pnpm --filter @transcribator/extension dev
pnpm --filter @transcribator/ui storybook
```

Storybook живет внутри `packages/ui`; отдельное приложение `apps/storybook` не используется.

## Env-файлы

- `apps/api/.env.example` коммитится и описывает поддерживаемые API values.
- `apps/api/.env` является локальным файлом и игнорируется git.
- `.env` файлы игнорируются во всем workspace.

## Переменные окружения API

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `PORT` | `3001` | Порт Express API |
| `HOST` | `127.0.0.1` | Host для Express bind |
| `TRANSCRIBE_TIMEOUT_MS` | `900000` в example, `15 * 60 * 1000` в коде | Останавливает долгие child pipelines |
| `MAX_UPLOAD_SIZE_GB` | `10` | Лимит размера multer upload |
| `YTDLP_COMMAND` | `yt-dlp` | Команда для скачивания URL |
| `FFMPEG_COMMAND` | `ffmpeg` | Команда для media conversion |
| `TRANSCRIPTION_ENGINE` | `openai-whisper` | Движок по умолчанию, если request не задает engine |
| `WHISPER_COMMAND` | `whisper` | Команда OpenAI Whisper CLI |
| `WHISPER_ARGS` | `{input} --model base --output_format txt --output_dir {outputDir}` | Аргументы OpenAI Whisper CLI |
| `MLX_WHISPER_COMMAND` | `mlx_whisper` | Команда MLX Whisper |
| `MLX_WHISPER_ARGS` | `{input} --model mlx-community/whisper-large-v3-turbo -f txt -o {outputDir}` | Аргументы MLX Whisper |
| `OPENAI_API_KEY` | none | Обязательна для engine `openai` |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | Модель OpenAI Audio Transcriptions |

## Внешние инструменты

Для URL transcription нужны:

- `yt-dlp`
- `ffmpeg`
- один transcription engine command или OpenAI API credentials

Для video downloads нужен:

- `yt-dlp`

Для file transcription нужны:

- `ffmpeg`
- один transcription engine command или OpenAI API credentials

Обычные команды установки на macOS:

```sh
brew install yt-dlp ffmpeg
pipx install openai-whisper
pipx install mlx-whisper
```

## Runtime storage

| Путь | Владелец | Содержимое |
| --- | --- | --- |
| `source/` | `apps/api/src/pipeline.ts` | Safe-name copies загруженных source media |
| `tmp/` | multer и pipeline | Incoming upload temp files, generated WAV files, Whisper output dirs |
| `output/` | pipeline и jobs | Итоговые transcript `.txt` files и `history.json` |
| `downloads/` | video download API | Скачанные YouTube videos |

Из этих директорий в git должны попадать только `.gitkeep` files.

## API surface

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/health` | Базовый health response API |
| `POST` | `/transcribe/url` | Запустить URL transcription job |
| `POST` | `/transcribe/file` | Запустить uploaded file transcription job |
| `GET` | `/transcribe/history` | Вернуть сохраненные history entries |
| `GET` | `/transcribe/jobs/:id/events` | Server-Sent Events stream для job progress |
| `POST` | `/videos/formats` | Вернуть доступные video download formats |
| `POST` | `/videos/download` | Скачать выбранный video format в `downloads/` |

Request и response schemas лежат в `packages/shared`.

## Progress stages

URL jobs используют:

- `download`
- `transcribe`
- `postprocess`

File jobs используют:

- `upload`
- `convert`
- `transcribe`
- `postprocess`

CRM отображает stage progress из SSE events и локально считает elapsed time.

## Операционные заметки

- Если `pnpm dev` падает с `EADDRINUSE`, проверь порты `3001` и `3002`.
- Если MLX Whisper падает с `No Metal device available`, запускай dev server из обычной macOS terminal session, а не из headless или virtualized session.
- Если external command не найдена, установи ее или задай абсолютный путь к команде в `apps/api/.env`.
- Pipeline stderr печатается в API process и включается в API error messages.
- API dev запускает TypeScript-исходники через `tsx`; после изменений API routes перезапускай `pnpm dev`, если текущий процесс не подхватил изменение.
