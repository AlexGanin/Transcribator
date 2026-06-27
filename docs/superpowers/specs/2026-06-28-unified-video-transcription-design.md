# Единая модель видео и транскрибации

Дата: 2026-06-28

## Цель

Перенести рабочий сценарий Transcribator в раздел «Видео» и удалить отдельную «Историю». Добавленное YouTube-видео должно быть единственной основной сущностью: в одной строке `youtube_videos` хранятся YouTube metadata, статус транскрибации, тексты, summary, markdown и список скриншотов.

Старые данные истории можно удалить без миграции.

## Область Изменений

- Удалить пункт меню «История» и страницы CRM `/history`, `/history/[id]`.
- Удалить API endpoints `/transcribe/history...`.
- Удалить runtime-модель `transcriptions` и `screenshots` как источник пользовательской истории.
- Перестать мигрировать legacy `runtime/output/history.json`.
- Расширить `youtube_videos` полями транскрибации и JSON-полями для скриншотов.
- Добавить запуск транскрибации из списка и деталки `/videos`.
- Сохранять результат транскрибации в соответствующую строку `youtube_videos`.

## Архитектура

`apps/api` остается владельцем всей media-логики. `youtube_videos` становится единственной пользовательской таблицей для YouTube backlog и результатов транскрибации.

Новая модель `youtube_videos` хранит:

- существующие YouTube metadata;
- `status`: `added`, `processing`, `done`, `error`;
- `transcription_job_id`;
- `transcription_engine`;
- `raw_text`;
- `clean_text`;
- `formatted_text`;
- `summary`;
- `markdown_path`;
- `transcription_error`;
- `transcription_started_at`;
- `transcription_finished_at`;
- `screenshots_json`;
- `trashed_screenshots_json`.

Файлы артефактов остаются в `runtime/artifacts/<video-id>/`, но индексируются JSON-полями в `youtube_videos`, а не отдельной таблицей.

## API

Остаются общие job/SSE endpoints:

- `GET /jobs/:id/events`

Удаляются history endpoints:

- `GET /transcribe/history`
- `GET/PATCH/DELETE /transcribe/history/:id`
- `POST /transcribe/history/:id/format`
- `POST /transcribe/history/:id/markdown`
- screenshot endpoints под `/transcribe/history/:id/...`

Добавляются video endpoints:

- `POST /videos/library/:id/transcribe` запускает транскрибацию URL видео.
- `PATCH /videos/library/:id/transcript` редактирует текстовые поля видео.
- `POST /videos/library/:id/format` готовит `formattedText`/summary через текущий placeholder-flow.
- `POST /videos/library/:id/markdown` создает Markdown в `runtime/artifacts/<video-id>/transcript.md`.
- `POST /videos/library/:id/screenshots/trash` переносит скриншоты в корзину.
- `POST /videos/library/:id/screenshots/restore` возвращает скриншоты из корзины.
- `DELETE /videos/library/:id/screenshots/trash` очищает корзину.
- `GET /videos/library/:id/screenshots/:scope/:fileName` отдает jpeg-файл скриншота.

## Data Flow

1. Пользователь добавляет YouTube-видео через extension.
2. API сохраняет строку `youtube_videos` и сразу подтягивает metadata через `yt-dlp`.
3. CRM `/videos` показывает карточку с кнопкой «Транскрибировать».
4. `POST /videos/library/:id/transcribe` переводит видео в `processing`, создает job и запускает текущий pipeline по URL видео.
5. CRM слушает `/jobs/:id/events` и показывает progress на карточке или деталке.
6. После `done` API сохраняет `rawText`, `cleanText`, `formattedText`, `summary`, engine, timestamps, screenshots JSON и markdown path в `youtube_videos`.
7. После `error` API сохраняет ошибку в `transcription_error` и переводит видео в `error`.

## CRM

Раздел `/videos` становится основным рабочим экраном:

- левый сайдбар каналов остается;
- у карточки видео появляется кнопка «Транскрибировать»;
- карточка показывает статус: добавлено, обрабатывается, готово, ошибка;
- готовые видео показывают краткий статус транскрипта и переход в подробности.

Детальная страница `/videos/[id]` показывает:

- YouTube metadata;
- кнопки «Назад», «Открыть», «Обновить metadata», «Транскрибировать»;
- progress текущего job;
- raw/clean/formatted transcript;
- summary;
- markdown action;
- screenshots gallery и корзину;
- ошибку транскрибации, если она есть.

## Удаление Истории

Таблицы `transcriptions` и `screenshots` удаляются при старте API через schema cleanup. Данные не мигрируются.

Файлы старых артефактов в `runtime/artifacts/` можно оставить на диске: они больше не будут доступны из UI и могут быть очищены вручную позже. Новые артефакты создаются по `video.id`.

## Ошибки И Состояния

- Если video metadata не загрузилась, видео все равно можно транскрибировать по canonical URL.
- Если транскрибация уже `processing`, повторный запуск возвращает текущий `jobId` или ошибку 409.
- Если pipeline падает, `youtube_videos.status = 'error'`, а текст ошибки сохраняется в `transcription_error`.
- Если скриншот-файл отсутствует на диске, API возвращает 404 для конкретного файла, но деталка видео остается доступной.

## Тестирование

- API unit tests для schema cleanup и новых полей `youtube_videos`.
- API tests для `POST /videos/library/:id/transcribe`: status transition, сохранение результата, сохранение ошибки.
- Tests для screenshots JSON operations: trash, restore, clear trash.
- Shared/api-client tests для новых contracts.
- CRM check для удаления history routes/menu и нового UI на `/videos`.
- `git diff --check`.

## Не Делаем Сейчас

- Не мигрируем старые `transcriptions` в `youtube_videos`.
- Не поддерживаем отдельную историю для file transcription.
- Не переносим media pipeline в Next.js.
- Не меняем extension flow добавления видео, кроме возможного отображения актуального статуса после API-изменений.
