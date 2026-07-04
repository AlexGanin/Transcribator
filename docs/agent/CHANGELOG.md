# Агентский changelog

Этот changelog хранит агентские изменения документации и проектных знаний.

## 2026-07-04

- Удалено: YouTube content script расширения с плавающей кнопкой «Добавить видео» в правом нижнем углу страницы; добавление видео остается доступно из popup расширения, а manifest больше не запрашивает YouTube host permission.
- Проверено: `pnpm --filter @transcribator/extension check`; `git diff --check`.
- Документация: обновлены `docs/agent/PROJECT_MAP.md` и `docs/agent/CHANGELOG.md`.

## 2026-06-28

- Изменено: отдельная история транскрибаций удалена из API и CRM; `youtube_videos` стала единой таблицей YouTube-видео, metadata, transcript-полей, Markdown path и JSON-скриншотов, а `/videos` получил запуск транскрибации и редактор транскрипта.
- Проверено: `pnpm --filter @transcribator/shared check`; `pnpm --filter @transcribator/api-client check`; `pnpm --filter @transcribator/api typecheck`; `pnpm --filter @transcribator/api build`; `pnpm --filter @transcribator/api test`; точечные `tsx --test` для `packages/api-client/src/index.test.ts`, `apps/crm/src/components/crm-navigation.test.ts`, `apps/crm/src/components/screenshot-lightbox-navigation.test.ts`, `apps/crm/src/components/youtube-video-channels.test.ts`, `apps/crm/src/components/transcript-clipboard.test.ts`; `pnpm --filter @transcribator/crm check`; `pnpm --filter @transcribator/extension check`; `pnpm --filter @transcribator/ui typecheck`; `pnpm --filter @transcribator/ui build`; `pnpm --filter @transcribator/ui build-storybook`; `git diff --check`.
- Документация: обновлены `README.md`, `docs/agent/README.md`, `docs/agent/PROJECT_MAP.md`, `docs/agent/INFRASTRUCTURE.md` и `docs/agent/CHANGELOG.md`.

- Изменено: пункт верхнего меню CRM «Видео» перенесен на первое место перед «Транскрибатор».
- Проверено: точечный `tsx --test apps/crm/src/components/crm-navigation.test.ts`; `pnpm --filter @transcribator/crm check`; `git diff --check`.
- Документация: обновлен `docs/agent/CHANGELOG.md`.

## 2026-06-27

- Исправлено: content script Transcribator extension больше не вызывает `browser.runtime.sendMessage`, чтобы stale script после перезагрузки расширения не ломал кнопку «Добавить видео».
- Проверено: `pnpm --filter @transcribator/extension check`.
- Исправлено: YouTube video backlog больше не оставляет ролики из extension неполными в CRM: extension читает fallback `ytInitialPlayerResponse`, API сразу кэширует полную metadata через `yt-dlp` при добавлении и дозаполняет старые записи без `metadataFetchedAt` при обновлении списка.
- Проверено: точечные `node --test` для `apps/extension/src/youtube-video.test.ts` и `apps/api/src/videoLibrary.test.ts`; `pnpm --filter @transcribator/api test`, `pnpm --filter @transcribator/api typecheck`, `pnpm --filter @transcribator/api build`, `pnpm --filter @transcribator/extension check`, `pnpm --filter @transcribator/crm check`; разовая дозагрузка metadata для текущей runtime-базы.
- Добавлено: CRM `/videos` получила левый сайдбар каналов с количеством добавленных роликов и фильтрацией списка по выбранному каналу.
- Проверено: точечные `node --test` для `apps/crm/src/components/youtube-video-channels.test.ts` и `apps/crm/src/components/crm-navigation.test.ts`; `pnpm --filter @transcribator/crm check`.
- Добавлено: детальная страница CRM `/videos/[id]` для добавленных YouTube-видео с кнопкой «Назад», обновлением metadata, описанием, длительностью, датами, статистикой, каналом, тегами, категориями и таблицей форматов.
- Изменено: API `GET /videos/library/:id` и `POST /videos/library/:id/metadata` кэшируют и обновляют `yt-dlp --dump-json` metadata в SQLite `youtube_videos`; `packages/shared` и `packages/api-client` получили соответствующие контракты.
- Проверено: точечные `node --test` для `apps/api/src/videoLibrary.test.ts`, `packages/api-client/src/index.test.ts`, `apps/crm/src/components/crm-navigation.test.ts`; `pnpm --filter @transcribator/shared check`, `pnpm --filter @transcribator/api test`, `pnpm --filter @transcribator/api typecheck`, `pnpm --filter @transcribator/api build`, `pnpm --filter @transcribator/api-client check`, `pnpm --filter @transcribator/crm check`, `git diff --check`.
- Документация: обновлены `README.md`, `docs/agent/PROJECT_MAP.md`, `docs/agent/INFRASTRUCTURE.md` и `docs/agent/CHANGELOG.md`.

## 2026-06-26

- Добавлено: YouTube video backlog: Chrome extension показывает кнопку «Добавить» на страницах YouTube, API сохраняет ролики в SQLite `youtube_videos`, CRM получила страницу `/videos`, а `packages/api-client` и `packages/shared` получили контракты `/videos/library`.
- Изменено: extension автоматически мигрирует старый локальный API default `3001` на текущий `2001`, чтобы ранее установленный popup/content script не ловил `Failed to fetch`.
- Изменено: кнопка добавления видео в extension теперь явно называется «Добавить видео» и есть в popup как отдельное действие от `Transcribe`.
- Проверено: `pnpm --filter @transcribator/shared check`, `pnpm --filter @transcribator/api test`, `pnpm --filter @transcribator/api-client check`, `pnpm --filter @transcribator/extension check`, `pnpm --filter @transcribator/crm check`, точечные `node --test` для `packages/api-client/src/index.test.ts`, `apps/crm/src/components/crm-navigation.test.ts`, `apps/extension/src/api-base-url.test.ts`, `apps/extension/src/video-library-action.test.ts` и `apps/extension/src/youtube-video.test.ts`.
- Документация: обновлены `README.md`, `docs/agent/README.md`, `docs/agent/PROJECT_MAP.md`, `docs/agent/INFRASTRUCTURE.md` и `docs/agent/CHANGELOG.md`.

## 2026-06-24

- Изменено: локальное сжатие видео переведено с CPU `libx264`/CRF на Apple VideoToolbox `hevc_videotoolbox` с MP4 `hvc1`, запретом software fallback (`-allow_sw 0`), ускоренным режимом `-prio_speed 1` и bitrate-пресетами для MacBook screen recordings: `4500k`/`3500k`/`2500k`.
- Проверено: `node --test --import tsx src/videoCompression.test.ts`, `pnpm --filter @transcribator/api test`, `pnpm --filter @transcribator/api typecheck`, `pnpm --filter @transcribator/api build`, smoke `compressVideo` с `hevc_videotoolbox` вне sandbox, `ffprobe` выходного файла (`codec_name=hevc`, `codec_tag_string=hvc1`, balanced video bitrate около `3.6 Mbps`).
- Документация: обновлены `README.md`, `docs/agent/PROJECT_MAP.md`, `docs/agent/INFRASTRUCTURE.md` и `docs/agent/CHANGELOG.md`.

## 2026-06-23

- Изменено: локальные порты Transcribator перенесены в диапазон 2000: CRM `127.0.0.1:2000`, API `127.0.0.1:2001`, Storybook `127.0.0.1:2002`; клиентские дефолты теперь используют `127.0.0.1`, чтобы избежать IPv6-конфликтов `localhost`; добавлен `.nvmrc` для Node `24.17.0`.
- Проверено: `node --test --import tsx ../../packages/api-client/src/index.test.ts`, `pnpm --filter @transcribator/shared check`, `pnpm --filter @transcribator/api test`, `pnpm --filter @transcribator/api typecheck`, `pnpm --filter @transcribator/api build`, `pnpm --filter @transcribator/api-client check`, `pnpm --filter @transcribator/crm check`, `pnpm --filter @transcribator/extension check`, `pnpm --filter @transcribator/ui typecheck`, `pnpm --filter @transcribator/ui build`, `curl -sS http://127.0.0.1:2001/health`, `curl -sS -I http://127.0.0.1:2000/compress`, smoke `POST /videos/compress` на `127.0.0.1:2001`, `git diff --check`.
- Документация: обновлены `README.md`, `docs/agent/README.md`, `docs/agent/INFRASTRUCTURE.md`, `docs/agent/PROJECT_MAP.md`, `docs/agent/WORKFLOW.md` и `docs/agent/CHANGELOG.md`.

## 2026-06-21

- Изменено: лимит загрузки файлов API `MAX_UPLOAD_SIZE_GB` увеличен с 10 до 20 GiB; обновлены дефолт кода, `apps/api/.env.example` и локальный `apps/api/.env`.
- Проверено: `node --test --import tsx src/uploadLimit.test.ts`, `pnpm --filter @transcribator/api test`, `pnpm --filter @transcribator/api typecheck`, `pnpm --filter @transcribator/api build`, `git diff --check`.
- Документация: обновлены `docs/agent/INFRASTRUCTURE.md` и `docs/agent/CHANGELOG.md`.

## 2026-06-19

- Добавлено: историю транскрибаций теперь можно удалять из CRM списка и деталки после подтверждения; API `DELETE /transcribe/history/:id` удаляет запись SQLite, screenshot-строки и `runtime/artifacts/<id>/`, не трогая `runtime/source/`.
- Проверено: `pnpm --filter @transcribator/api test`, `node --test --import tsx ../crm/src/components/history-delete.test.ts`, `pnpm --filter @transcribator/api typecheck`, `pnpm --filter @transcribator/api build`, `pnpm --filter @transcribator/shared check`, `pnpm --filter @transcribator/api-client check`, `pnpm --filter @transcribator/crm check`, `git diff --check`.
- Документация: обновлены `docs/agent/PROJECT_MAP.md`, `docs/agent/INFRASTRUCTURE.md` и `docs/agent/CHANGELOG.md`.

- Добавлено: CRM теперь умеет копировать `Clean Transcript` из текущего результата транскрибации и деталки истории для ручной обработки в ChatGPT.
- Проверено: `pnpm --filter @transcribator/crm check`.
- Документация: обновлен `docs/agent/PROJECT_MAP.md`.

- Изменено: корневой `AGENTS.md` теперь явно направляет агентов перед архитектурными ответами, анализом поведения, нетривиальными изменениями и отладкой читать `docs/agent/README.md` и релевантные файлы из `docs/agent/`.
- Изменено: в `AGENTS.md` зафиксированы краткие архитектурные границы workspace-пакетов, правило для `runtime/` и базовый рабочий процесс с `git status --short`, `rg`, проверками из `WORKFLOW.md` и `git diff --check`.
- Проверено: `git diff --check`.
- Документация: обновлены `AGENTS.md`, `docs/agent/WORKFLOW.md` и `docs/agent/CHANGELOG.md`.

## 2026-06-18

- Изменено: Obsidian `transcript.md` теперь содержит только финальную Markdown-транскрипцию с читаемыми абзацами; сырые `Raw Transcript` и `Clean Transcript` секции больше не выводятся.
- Добавлено: Obsidian-ready Markdown export для транскрибаций со скриншотами, runtime-папка `runtime/obsidian/`, metadata и поля history/result для Markdown path, Obsidian folder path и количества screenshots.

## 2026-06-17

- Добавлено: CRM-вкладка «Сжать видео» с локальной загрузкой одного видео, ffprobe/ffmpeg compression pipeline, реальным SSE progress и сохранением результата в `runtime/compressed/`.
- Изменено: runtime-папки `source`, `tmp`, `output` и `downloads` перенесены в общий корневой каталог `runtime/`; код API и документация обновлены на новые пути.
- Изменено: базовый runtime обновлен до Node.js 24.x и pnpm 11.x.
- Изменено: обновлены Express до 5.x, OpenAI SDK до 6.x, dotenv, concurrently и Node types 24.x; WXT tooling перенесен в devDependencies extension.
- Добавлено: минимальный pnpm override для `electron-to-chromium@1.5.373`, чтобы пройти active minimum release age policy pnpm 11.
- Добавлено: точечные pnpm overrides для audit advisory в транзитивных зависимостях `esbuild`, `postcss`, `shell-quote`, `tmp@0.2.7` и `uuid`.
- Изменено: API `apps/api/src` переведен с ручного JavaScript на TypeScript с NodeNext `tsconfig.json`, `tsx` dev runner и `tsc` build.
- Изменено: CRM configs `next.config` и `postcss.config` переведены с `.mjs` на TypeScript.
- Игнорируется: generated output `apps/*/dist/` после TypeScript build приложений.
- Добавлено: Storybook UI Kit внутри `packages/ui` с историями всех экспортируемых компонентов и паттернами Transcribator.
- Изменено: корневые команды дополнены `pnpm storybook` и `pnpm build-storybook`, которые прокидываются в `@transcribator/ui`.
- Игнорируется: generated output `packages/*/storybook-static/` после Storybook build.
- Изменено: зафиксировано правило, что проектные правила и агентская документация пишутся на русском языке.
- Изменено: задокументирован формат commit request с префиксом ветки и обязательным push сразу после коммита.
- Изменено: реализации компонентов `packages/ui` перенесены в отдельные папки с `index.tsx`, чтобы рядом можно было хранить Storybook и локальные component artifacts.
- Исправлено: CRM source selector теперь отдельно монтирует URL и file inputs, чтобы избежать React controlled/uncontrolled warnings.

## 2026-06-16

- Изменено: репозиторий переведен на pnpm workspace с `apps/api`, `apps/crm`, `apps/extension`, `packages/shared`, `packages/api-client` и `packages/ui`.
- Изменено: Express API перенесен в `apps/api`, при этом transcription, video download, uploads, history и SSE logic остались в Express.
- Добавлено: `packages/shared` с Zod-контрактами для API requests, responses, progress events, engines, history и video downloads.
- Добавлено: `packages/api-client` как fetch client для API-вызовов из CRM и extension.
- Добавлено: `packages/ui` с общими shadcn-style React components на Tailwind и Radix primitives.
- Добавлено: Next.js App Router CRM с transcription, file upload, engine selection, SSE progress, history и video download flows.
- Добавлено: WXT React Manifest V3 extension scaffold с popup, background service worker и YouTube content script с Shadow DOM isolation.
- Удалено: legacy Vite `client/`, npm-era root `server/` и старые npm lockfiles после успешного `pnpm install`.
- Удалено: устаревшие superpowers plan/spec files, которые описывали старую архитектуру Vite и root `server/`.
- Документация: обновлены README, project map, infrastructure и workflow под workspace-структуру.

## 2026-06-15

- Добавлено: начальный набор самодокументации `docs/agent/`.
- Задокументировано: project map, infrastructure, ports, commands, env vars, runtime paths, API routes, data flow и agent workflow.
- Игнорируется: локальные `.next/` generated artifacts, чтобы agent status checks оставались сфокусированными.
- Проверено: документация была выведена из текущих файлов репозитория и runtime scripts.
