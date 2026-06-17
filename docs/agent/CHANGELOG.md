# Agent Changelog

This changelog tracks agent-facing documentation and project-knowledge changes.

## 2026-06-17

- Changed: moved `packages/ui` component implementations into per-component folders with `index.tsx` entry files for future Storybook and local component artifacts.
- Fixed: CRM source selector now remounts URL and file inputs separately to avoid React controlled/uncontrolled warnings.

## 2026-06-16

- Changed: migrated the repository to a pnpm workspace with `apps/api`, `apps/crm`, `apps/extension`, `packages/shared`, `packages/api-client` and `packages/ui`.
- Changed: moved Express API code to `apps/api` while keeping transcription, video download, uploads, history and SSE logic in Express.
- Added: `packages/shared` Zod contracts for API requests, responses, progress events, engines, history and video downloads.
- Added: `packages/api-client` fetch client for CRM and extension API calls.
- Added: `packages/ui` shared shadcn-style React components on Tailwind and Radix primitives.
- Added: Next.js App Router CRM with transcription, file upload, engine selection, SSE progress, history and video download flows.
- Added: WXT React Manifest V3 extension scaffold with popup, background service worker and YouTube content script with Shadow DOM isolation.
- Removed: legacy Vite `client/`, npm-era `server/` root and old npm lockfiles after `pnpm install` completed.
- Removed: stale superpowers plan/spec files that described the old Vite and root `server/` architecture.
- Docs: updated README, project map, infrastructure and workflow documentation for the workspace layout.

## 2026-06-15

- Added: initial `docs/agent/` self-documentation set.
- Documented: project map, infrastructure, ports, commands, env vars, runtime paths, API routes, data flow, and agent workflow.
- Ignored: local `.next/` generated artifacts so agent status checks stay focused.
- Verified: documentation was derived from current repository files and runtime scripts.
