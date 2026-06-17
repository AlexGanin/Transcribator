# Агентский changelog

Этот changelog хранит агентские изменения документации и проектных знаний.

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
