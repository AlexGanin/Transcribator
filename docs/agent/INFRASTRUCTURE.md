# Инфраструктура

Этот файл описывает локальную runtime-инфраструктуру, команды, порты, переменные окружения и внешние зависимости.

## Runtime model

Transcribator запускается как pnpm workspace на Node.js `24.x` и pnpm `11.x`. По умолчанию локальная разработка состоит из двух процессов:

- CRM: Next.js dev server на `http://127.0.0.1:2000`.
- API: Express server на `http://127.0.0.1:2001`.

Chrome extension при необходимости разрабатывается отдельно через WXT.
Storybook для `packages/ui` запускается отдельно на `http://127.0.0.1:2002`.

## Порты

| Сервис | По умолчанию | Источник |
| --- | --- | --- |
| CRM UI | `127.0.0.1:2000` | `apps/crm/package.json` |
| API | `127.0.0.1:2001` | `apps/api/src/index.ts`, можно переопределить через `apps/api/.env` |
| Storybook UI Kit | `127.0.0.1:2002` | `packages/ui/package.json` |

CRM использует `NEXT_PUBLIC_API_BASE_URL`, если переменная задана, иначе `http://127.0.0.1:2001`.
Extension использует `VITE_API_BASE_URL`, если переменная задана, иначе `http://127.0.0.1:2001`.

## Команды

Запускай из корня репозитория, если не указано иначе.

```sh
corepack enable
corepack prepare pnpm@11.7.0 --activate
nvm use
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
| `PORT` | `2001` | Порт Express API |
| `HOST` | `127.0.0.1` | Host для Express bind |
| `TRANSCRIBE_TIMEOUT_MS` | `900000` в example, `15 * 60 * 1000` в коде | Останавливает долгие child pipelines |
| `MAX_UPLOAD_SIZE_GB` | `20` | Лимит размера multer upload |
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

Для local video compression нужен `ffmpeg` с энкодером `hevc_videotoolbox`; API использует Apple VideoToolbox HEVC/H.265, запрещает software fallback для видеоэнкодера и пишет MP4 с `hvc1` tag. Текущие bitrate-пресеты рассчитаны на MacBook screen recordings: `4500k` для высокого качества, `3500k` для баланса и `2500k` для минимального размера.

Обычные команды установки на macOS:

```sh
brew install yt-dlp ffmpeg
pipx install openai-whisper
pipx install mlx-whisper
```

## Runtime storage

`runtime/` — общий локальный каталог для файлов, которые появляются во время работы API. Это не исходники проекта, а рабочие данные: SQLite-индекс YouTube-видео с транскриптами, загруженные медиа, временные файлы конвертации, screenshots, Markdown-артефакты, скачанные видео и legacy Obsidian-заметки. Каталог нужен, чтобы runtime-артефакты не смешивались с кодом, пакетами и документацией.

| Путь | Кто использует | Что появляется внутри |
| --- | --- | --- |
| `runtime/transcribator.sqlite` | `apps/api/src/videoLibrary.ts`, `apps/api/src/videoTranscription.ts`, `apps/api/src/videoArtifacts.ts` | Единый источник правды для CRM `/videos` и результатов транскрибации. Таблица `youtube_videos` хранит YouTube-ролики (`sourceType=youtube`) и локальные upload-файлы (`sourceType=file`), дедуплицирует YouTube по `youtube_video_id`, хранит `source_path`/`original_file_name` для локальных файлов, задает локальным upload-транскрибациям дефолтный `channel_title`/источник `Транскрибации`, кэширует детальные `yt-dlp` metadata для YouTube-карточек, а также хранит ручное поле `manual_date`, status, job id, engine, raw/clean/formatted text, summary, markdown path, timestamps, error и JSON-списки active/trash screenshots. Удаление записи из CRM `/videos` удаляет строку из этой таблицы. Legacy-таблицы `transcriptions` и `screenshots` удаляются при старте API без миграции. |
| `runtime/source/` | `apps/api/src/pipeline.ts`, `apps/api/src/videoArtifacts.ts` | Копии файлов, которые пользователь отправил на транскрибацию через upload. API сохраняет их под безопасным именем файла, чтобы исходник можно было повторно обработать или сверить с результатом. При удалении локальной file-записи видеотеки API удаляет эту копию, если путь находится внутри `runtime/source/`. |
| `runtime/tmp/` | `multer`, `apps/api/src/index.ts`, `apps/api/src/pipeline.ts` | Временные upload-файлы, WAV-файлы после конвертации через `ffmpeg`, а также рабочие папки CLI-движков Whisper. Эти данные нужны только во время обработки и могут очищаться после завершения задач. |
| `runtime/output/` | legacy | Legacy-каталог. Новые итоговые `.txt`-транскрипты и `history.json` больше не создаются и не мигрируются. |
| `runtime/artifacts/` | `apps/api/src/obsidianNotes.ts`, `apps/api/src/videoArtifacts.ts`, `apps/api/src/pipeline.ts` | Файловые артефакты видео и transient jobs. Для транскрибации сохраненного YouTube-видео со скриншотами создается `runtime/artifacts/<video-id>/screenshots/*.jpg`; удаление переносит файлы в `runtime/artifacts/<video-id>/trash/screenshots/*.jpg`. Кнопка «Создать Markdown» пишет `runtime/artifacts/<video-id>/transcript.md` из данных SQLite. Ручная загрузка превью пишет один актуальный файл `runtime/artifacts/<video-id>/thumbnail/thumbnail-<timestamp>.(jpg|png|webp)`, а ссылка хранится в `thumbnail_url` SQLite. При удалении записи видеотеки API удаляет весь `runtime/artifacts/<video-id>/`. |
| `runtime/downloads/` | `apps/api/src/videoDownload.ts` | Видео, скачанные через вкладку скачивания YouTube. Имя файла формируется из названия ролика и выбранного format id. |
| `runtime/compressed/` | `apps/api/src/videoCompression.ts` | Сжатые локальные видео из вкладки CRM «Сжать видео». API пишет сюда MP4-файлы Apple VideoToolbox HEVC/H.265 + AAC с безопасным именем, выбранным пресетом и timestamp. |
| `runtime/obsidian/` | legacy helpers/tests | Legacy Obsidian-ready vault folders старых записей. Новые транскрибации больше не создают здесь `transcript.md`/`metadata.json`; Markdown создается отдельно в `runtime/artifacts/<transcription-id>/`. |

Правило для git: из `runtime/source/`, `runtime/tmp/`, `runtime/output/`, `runtime/artifacts/`, `runtime/downloads/`, `runtime/compressed/` и `runtime/obsidian/` коммитятся только `.gitkeep` файлы. `runtime/transcribator.sqlite`, реальные медиа, временные файлы, `history.json`, Markdown, `.jpg`, скачанные и сжатые видео, legacy Obsidian `.md`/`metadata.json`, а также системные файлы вроде `.DS_Store` должны оставаться локальными.

Если нужно почистить место на диске, безопаснее всего начинать с `runtime/tmp/`, старых файлов в `runtime/downloads/`, старых сжатых роликов в `runtime/compressed/` и ненужных файлов в `runtime/artifacts/<id>/trash/`. `runtime/transcribator.sqlite` лучше не удалять без осознанного решения, потому что он используется экраном видео в CRM.

## API surface

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/health` | Базовый health response API |
| `POST` | `/transcribe/url` | Запустить URL transcription job; YouTube-ссылки автоматически добавляются/дедуплицируются в `youtube_videos` и после завершения появляются в CRM `/videos` с сохраненным транскриптом |
| `POST` | `/transcribe/file` | Запустить uploaded file transcription job; локальный файл сохраняется в `runtime/source/`, получает `sourceType=file` запись в `youtube_videos` с источником `Транскрибации` и после завершения появляется в CRM `/videos` с сохраненным транскриптом |
| `GET` | `/transcribe/jobs/:id/events` | Server-Sent Events stream для job progress |
| `GET` | `/jobs/:id/events` | Нейтральный Server-Sent Events stream для job progress |
| `POST` | `/videos/formats` | Вернуть доступные video download formats |
| `POST` | `/videos/download` | Скачать выбранный video format в `runtime/downloads/` |
| `GET` | `/videos/library` | Вернуть видеотеку для CRM `/videos`: YouTube-ролики и локальные файлы |
| `GET` | `/videos/library/check` | Проверить по URL, добавлено ли YouTube-видео |
| `GET` | `/videos/library/:id` | Вернуть детальную карточку сохраненной записи; для YouTube при отсутствии metadata попробовать загрузить ее через `yt-dlp --dump-json` и закэшировать |
| `DELETE` | `/videos/library/:id` | Удалить сохраненную запись видеотеки, ее `runtime/artifacts/<video-id>/` и API-owned source copy локального файла внутри `runtime/source/` |
| `POST` | `/videos/library/:id/metadata` | Принудительно обновить кэш metadata YouTube-записи; для локальных file-записей возвращает текущую карточку без `yt-dlp` |
| `POST` | `/videos/library/:id/transcribe` | Запустить transcription job для сохраненного YouTube-видео или локального файла и сохранить результат в `youtube_videos` |
| `PATCH` | `/videos/library/:id/transcript` | Обновить ручные поля карточки `title`, `manualDate`, `description`, `channelTitle` и transcript-поля `summary`, `formattedText`, `cleanText`, `rawText` у видео |
| `POST` | `/videos/library/:id/format` | Placeholder AI step: fake delay и заполнение `formattedText` текущим лучшим текстом |
| `POST` | `/videos/library/:id/markdown` | Сгенерировать `runtime/artifacts/<video-id>/transcript.md` из SQLite |
| `POST` | `/videos/library/:id/thumbnail` | Загрузить вручную назначенное превью JPEG/PNG/WebP для YouTube или локальной file-записи, сохранить файл в `runtime/artifacts/<video-id>/thumbnail/` и обновить `thumbnail_url` |
| `GET` | `/videos/library/:id/thumbnail/:fileName` | Отдать текущий вручную назначенный файл превью видео |
| `POST` | `/videos/library/:id/screenshots/trash` | Перенести выбранные active screenshots видео в `trash/screenshots` и обновить JSON в SQLite |
| `POST` | `/videos/library/:id/screenshots/restore` | Вернуть выбранные screenshots видео из корзины обратно в active |
| `DELETE` | `/videos/library/:id/screenshots/trash` | Физически удалить файлы из корзины и очистить trash JSON |
| `GET` | `/videos/library/:id/screenshots/:scope/:fileName` | Отдать JPEG-файл скриншота видео |
| `POST` | `/videos/library` | Добавить YouTube-видео из Chrome extension в backlog |
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

Markdown больше не является частью progress pipeline: CRM создает его отдельной кнопкой в деталке видео. CRM отображает stage progress из SSE events и локально считает elapsed time.

## Операционные заметки

- Если `pnpm dev` пишет `Unsupported engine`, проверь `node --version` и выполни `nvm use` из корня проекта.
- Если `pnpm dev` падает с `EADDRINUSE`, проверь порты `2000`, `2001` и `2002`.
- Если MLX Whisper падает с `No Metal device available`, запускай dev server из обычной macOS terminal session, а не из headless или virtualized session.
- Если external command не найдена, установи ее или задай абсолютный путь к команде в `apps/api/.env`.
- Pipeline stderr печатается в API process и включается в API error messages.
- API dev запускает TypeScript-исходники через `tsx`; после изменений API routes перезапускай `pnpm dev`, если текущий процесс не подхватил изменение.
