# Агентский workflow

Этот файл описывает предпочтительный workflow для агентов, которые меняют репозиторий.

## Перед редактированием

1. Прочитай `docs/agent/README.md`.
2. Проверь статус:

```sh
git status --short
```

3. Перед изменением поведения ищи по проекту через `rg`:

```sh
rg -n "term-to-find" .
```

4. Определи, какой файл документации нужно обновить:

- Изменилась структура или ответственность: обнови `PROJECT_MAP.md`.
- Изменились порты, команды, env vars, инструменты или runtime paths: обнови `INFRASTRUCTURE.md`.
- Изменился процесс разработки: обнови `WORKFLOW.md`.
- Любое значимое изменение поведения: добавь запись в `CHANGELOG.md`.

## Правила редактирования

- Держи изменения строго в рамках пользовательского запроса.
- Оставляй Express business logic в `apps/api`; не переноси media-логику в Next route handlers.
- Держи общие контракты в `packages/shared` и используй Zod для runtime API validation.
- Держи браузерные API-вызовы в `packages/api-client`; не добавляй туда React, Next, Chrome или Node-specific API.
- Держи общий UI в `packages/ui`; не добавляй туда Next, Chrome или Node-specific API.
- Держи ручные исходники и конфиги TypeScript-first: не добавляй `.js`, `.jsx`, `.mjs` или `.cjs` файлы вне generated output и обычных asset-файлов.
- Не коммить generated files: `.next/`, `.wxt/`, app/package `dist/`, `runtime/source/*`, `runtime/tmp/*`, `runtime/output/*`, `runtime/downloads/*`, `runtime/compressed/*`, кроме `.gitkeep`.
- Держи `.env` файлы только локально.
- Сохраняй текущее runtime-поведение, если пользователь явно не просит изменить его.
- Предпочитай небольшие файлы с понятной ответственностью при добавлении нового кода.
- Обновляй агентскую документацию в той же правке, в которой меняется описываемое поведение.
- Все проектные правила и агентская документация должны быть написаны на русском языке.

## Матрица проверок

Используй самую маленькую проверку, которая доказывает изменение, затем запускай более широкие проверки для общего поведения.

| Тип изменения | Обязательная проверка |
| --- | --- |
| Поведение API на TypeScript | `pnpm --filter @transcribator/api typecheck` и `pnpm --filter @transcribator/api build` |
| Shared contract или API client | `pnpm --filter @transcribator/shared check` и `pnpm --filter @transcribator/api-client check` |
| CRM UI | `pnpm --filter @transcribator/crm check` |
| UI Kit или Storybook | `pnpm --filter @transcribator/ui typecheck`, `pnpm --filter @transcribator/ui build` и при изменении stories `pnpm --filter @transcribator/ui build-storybook` |
| Extension | `pnpm --filter @transcribator/extension check` |
| Root script или cross-workspace изменение | `pnpm check` |
| Только документация | `git diff --check` плюс чтение измененных docs |
| Порт или запуск | `pnpm dev`, подтверждение портов, затем остановка процесса, если пользователь не просил оставить его запущенным |

Всегда запускай:

```sh
git diff --check
```

перед утверждением, что изменение завершено, и перед коммитом.

## Практика changelog

Добавляй запись в `docs/agent/CHANGELOG.md` после каждого значимого изменения.

Формат:

```md
## YYYY-MM-DD

- Изменено: краткое описание.
- Проверено: команда или ручная проверка.
- Документация: обновленные файлы.
```

Если изменение касается только документации, все равно записывай его, когда оно создает или меняет агентские знания о проекте.

## Практика коммитов

Когда пользователь просит сделать коммит:

1. Проверь `git status --short`.
2. Проверь `git diff --stat` и релевантные diff.
3. Запусти обязательную проверку.
4. Добавь в stage только релевантные файлы.
5. Получи текущую ветку командой `git branch --show-current`.
6. Сделай коммит с сообщением в формате `<branch>. <Описание изменения с большой буквы>`.
7. Сразу после успешного коммита выполни push.
8. Сообщи hash коммита, результат push и оставшиеся untracked или modified файлы.

Не включай в коммит несвязанные пользовательские изменения или generated artifacts.
Если push не прошел из-за авторизации, сети или отсутствующего upstream, сообщи точную причину и оставь локальный коммит на месте.

## Проверенные команды

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm check
git diff --check
```

Локальный smoke-check:

```sh
pnpm dev
curl -sS http://127.0.0.1:3001/health
curl -sS -I http://127.0.0.1:3002/
```

Останавливай dev server после smoke-check, если пользователь не просил оставить его запущенным.
