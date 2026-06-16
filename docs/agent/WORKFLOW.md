# Agent Workflow

This file describes the preferred workflow for agents changing this repository.

## Before Editing

1. Read `docs/agent/README.md`.
2. Check status:

```sh
git status --short
```

3. Search with `rg` before changing behavior:

```sh
rg -n "term-to-find" .
```

4. Identify which documentation file must be updated with the change:

- Structure or responsibility changed: update `PROJECT_MAP.md`.
- Ports, commands, env vars, tools, or runtime paths changed: update `INFRASTRUCTURE.md`.
- Development process changed: update `WORKFLOW.md`.
- Any meaningful behavior changed: append `CHANGELOG.md`.

## Editing Rules

- Keep changes scoped to the user request.
- Keep Express business logic in `apps/api`; do not move media work into Next route handlers.
- Keep shared contracts in `packages/shared` and use Zod for runtime API validation.
- Keep browser API calls in `packages/api-client`; do not add React, Next, Chrome or Node-specific APIs there.
- Keep shared UI in `packages/ui`; do not add Next, Chrome or Node-specific APIs there.
- Do not commit generated files such as `.next/`, `.wxt/`, package `dist/`, `source/*`, `tmp/*`, `output/*`, or `downloads/*`.
- Keep `.env` files local-only.
- Preserve current runtime behavior unless the user explicitly asks to change it.
- Prefer small files with clear ownership when adding new code.
- Update agent docs in the same change as the behavior they describe.

## Verification Matrix

Use the smallest verification that proves the change, then run broader checks for shared behavior.

| Change Type | Required Verification |
| --- | --- |
| API JS behavior | `pnpm --filter @transcribator/api check` |
| Shared contract or API client change | `pnpm --filter @transcribator/shared check` and `pnpm --filter @transcribator/api-client check` |
| CRM UI change | `pnpm --filter @transcribator/crm check` |
| Extension change | `pnpm --filter @transcribator/extension check` |
| Root script or cross-workspace change | `pnpm check` |
| Documentation-only change | `git diff --check` plus read the changed docs |
| Port or startup change | `pnpm dev`, confirm ports, then stop the run unless asked to keep it running |

Always run:

```sh
git diff --check
```

before claiming a change is complete or before committing.

## Change Log Practice

Append `docs/agent/CHANGELOG.md` after every meaningful change.

Use this format:

```md
## YYYY-MM-DD

- Changed: short description.
- Verified: command or manual check.
- Docs: files updated.
```

If a change is documentation-only, still record it when it creates or changes agent operating knowledge.

## Commit Practice

When the user asks for a commit:

1. Inspect `git status --short`.
2. Inspect `git diff --stat` and relevant diffs.
3. Run required verification.
4. Stage only relevant files.
5. Commit with a concise message.
6. Report commit hash and remaining untracked or modified files.

Do not include unrelated user changes or generated artifacts in commits.

## Known Good Commands

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm check
git diff --check
```

For local smoke checking:

```sh
pnpm dev
curl -sS http://127.0.0.1:3001/health
curl -sS -I http://127.0.0.1:3002/
```

Stop the dev server after smoke checking unless the user asked to keep it running.
