# Инфраструктура

Этот файл описывает локальную runtime-инфраструктуру, команды, порты, переменные окружения и внешние зависимости.

## Runtime model

Transcribator запускается как pnpm workspace на Node.js `24.x` и pnpm `11.x`. По умолчанию локальная разработка состоит из двух процессов:

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
corepack prepare pnpm@11.7.0 --activate
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
| `TRANSCRIBE_SILENCE_NOISE_DB` | `-35dB` | Порог ffmpeg `silencedetect` перед локальной транскрибацией |
| `TRANSCRIBE_MIN_SILENCE_SECONDS` | `1` | Минимальная длительность тишины для VAD |
| `TRANSCRIBE_SPEECH_PADDING_SECONDS` | `0.25` | Padding вокруг найденных speech ranges |
| `TRANSCRIBE_MIN_SPEECH_SECONDS` | `0.4` | Минимальная длительность речевого диапазона |
| `TRANSCRIPTION_ENGINE` | `openai-whisper` | Движок по умолчанию, если request не задает engine |
| `WHISPER_COMMAND` | `whisper` | Команда OpenAI Whisper CLI |
| `WHISPER_ARGS` | `{input} --model base --language ru --condition_on_previous_text False --word_timestamps True --hallucination_silence_threshold 2 --clip_timestamps {clipTimestamps} --output_format txt --output_dir {outputDir}` | Аргументы OpenAI Whisper CLI |
| `MLX_WHISPER_COMMAND` | `mlx_whisper` | Команда MLX Whisper |
| `MLX_WHISPER_ARGS` | `{input} --model mlx-community/whisper-large-v3-turbo --language ru --condition-on-previous-text False --word-timestamps True --hallucination-silence-threshold 2 --clip-timestamps {clipTimestamps} -f txt -o {outputDir}` | Аргументы MLX Whisper |
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

`runtime/` — общий локальный каталог для файлов, которые появляются во время работы API. Это не исходники проекта, а рабочие данные: SQLite-индекс транскрибаций, загруженные медиа, временные файлы конвертации, screenshots, Markdown-артефакты, скачанные видео и legacy Obsidian-заметки. Каталог нужен, чтобы runtime-артефакты не смешивались с кодом, пакетами и документацией.

| Путь | Кто использует | Что появляется внутри |
| --- | --- | --- |
| `runtime/transcribator.sqlite` | `apps/api/src/transcriptionStore.ts`, `apps/api/src/jobs.ts`, `apps/api/src/historyDetails.ts` | Единый источник правды для истории транскрибаций и состояния скриншотов. Таблица `transcriptions` хранит `rawText`, `cleanText`, будущие `formattedText`/`summary`, статусы, source/engine и `markdownPath`. Таблица `screenshots` хранит имя файла, timestamp, статус `active`/`trash` и текущий путь. |
| `runtime/source/` | `apps/api/src/pipeline.ts` | Копии файлов, которые пользователь отправил на транскрибацию через upload. API сохраняет их под безопасным именем файла, чтобы исходник можно было повторно обработать или сверить с результатом. |
| `runtime/tmp/` | `multer`, `apps/api/src/index.ts`, `apps/api/src/pipeline.ts` | Временные upload-файлы, WAV-файлы после конвертации через `ffmpeg`, а также рабочие папки CLI-движков Whisper. Эти данные нужны только во время обработки и могут очищаться после завершения задач. |
| `runtime/output/` | `apps/api/src/transcriptionStore.ts` migration | Legacy-каталог. Новые итоговые `.txt`-транскрипты больше не создаются. Старый `history.json` может быть прочитан при старте API и импортирован в SQLite, после чего SQLite становится источником истории. |
| `runtime/artifacts/` | `apps/api/src/obsidianNotes.ts`, `apps/api/src/markdownArtifacts.ts`, `apps/api/src/historyDetails.ts` | Файловые артефакты записей истории. Для транскрибации со скриншотами создается `runtime/artifacts/<transcription-id>/screenshots/*.jpg`; удаление переносит файлы в `runtime/artifacts/<transcription-id>/trash/screenshots/*.jpg`. Кнопка «Создать Markdown» пишет `runtime/artifacts/<transcription-id>/transcript.md` из данных SQLite. |
| `runtime/downloads/` | `apps/api/src/videoDownload.ts` | Видео, скачанные через вкладку скачивания YouTube. Имя файла формируется из названия ролика и выбранного format id. |
| `runtime/compressed/` | `apps/api/src/videoCompression.ts` | Сжатые локальные видео из вкладки CRM «Сжать видео». API пишет сюда MP4-файлы H.264 + AAC с безопасным именем, выбранным пресетом и timestamp. |
| `runtime/obsidian/` | legacy helpers/tests | Legacy Obsidian-ready vault folders старых записей. Новые транскрибации больше не создают здесь `transcript.md`/`metadata.json`; Markdown создается отдельно в `runtime/artifacts/<transcription-id>/`. |

Правило для git: из `runtime/source/`, `runtime/tmp/`, `runtime/output/`, `runtime/artifacts/`, `runtime/downloads/`, `runtime/compressed/` и `runtime/obsidian/` коммитятся только `.gitkeep` файлы. `runtime/transcribator.sqlite`, реальные медиа, временные файлы, `history.json`, Markdown, `.jpg`, скачанные и сжатые видео, legacy Obsidian `.md`/`metadata.json`, а также системные файлы вроде `.DS_Store` должны оставаться локальными.

Если нужно почистить место на диске, безопаснее всего начинать с `runtime/tmp/`, старых файлов в `runtime/downloads/`, старых сжатых роликов в `runtime/compressed/` и ненужных файлов в `runtime/artifacts/<id>/trash/`. `runtime/transcribator.sqlite` лучше не удалять без осознанного решения, потому что он используется экраном истории в CRM. `runtime/output/history.json` после миграции нужен только как legacy backup.

## API surface

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/health` | Базовый health response API |
| `POST` | `/transcribe/url` | Запустить URL transcription job |
| `POST` | `/transcribe/file` | Запустить uploaded file transcription job |
| `GET` | `/transcribe/history` | Вернуть сохраненные history entries |
| `GET` | `/transcribe/history/:id` | Вернуть SQLite detail записи, активные screenshots и корзину |
| `PATCH` | `/transcribe/history/:id` | Обновить `source`, `engine`, `summary`, `formattedText`, `cleanText`, `rawText` |
| `POST` | `/transcribe/history/:id/format` | Placeholder AI step: fake delay и заполнение `formattedText` текущим лучшим текстом, чтобы позже заменить реальной нейросетью |
| `POST` | `/transcribe/history/:id/markdown` | Сгенерировать `runtime/artifacts/<id>/transcript.md` из SQLite; выбирает `formattedText`, затем `cleanText`, затем `rawText`, и включает summary только если он уже есть |
| `POST` | `/transcribe/history/:id/screenshots/trash` | Перенести выбранные active screenshots в `trash/screenshots` и обновить SQLite статус |
| `POST` | `/transcribe/history/:id/screenshots/restore` | Вернуть выбранные screenshots из корзины обратно в active |
| `DELETE` | `/transcribe/history/:id/screenshots/trash` | Физически удалить файлы из корзины и убрать trash-строки SQLite |
| `GET` | `/transcribe/jobs/:id/events` | Server-Sent Events stream для job progress |
| `GET` | `/jobs/:id/events` | Нейтральный Server-Sent Events stream для job progress |
| `POST` | `/videos/formats` | Вернуть доступные video download formats |
| `POST` | `/videos/download` | Скачать выбранный video format в `runtime/downloads/` |
| `POST` | `/videos/compress` | Загрузить локальный video file и запустить compression job в `runtime/compressed/` |

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

Если в запросе транскрибации включен `screenshotsEnabled`, после `postprocess` добавляются stages:

- `screenshots`

Markdown больше не является частью progress pipeline: CRM создает его отдельной кнопкой в деталке истории. CRM отображает stage progress из SSE events и локально считает elapsed time.

## Операционные заметки

- Если `pnpm dev` падает с `EADDRINUSE`, проверь порты `3001` и `3002`.
- Если MLX Whisper падает с `No Metal device available`, запускай dev server из обычной macOS terminal session, а не из headless или virtualized session.
- Если external command не найдена, установи ее или задай абсолютный путь к команде в `apps/api/.env`.
- Pipeline stderr печатается в API process и включается в API error messages.
- API dev запускает TypeScript-исходники через `tsx`; после изменений API routes перезапускай `pnpm dev`, если текущий процесс не подхватил изменение.
