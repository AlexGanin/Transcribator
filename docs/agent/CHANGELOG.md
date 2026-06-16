# Agent Changelog

This changelog tracks agent-facing documentation and project-knowledge changes.

## 2026-06-16

- Added: `Скачать видео` tab for YouTube format selection and downloads.
- Added: `downloads/` runtime directory for downloaded videos.
- Added: `/videos/formats` and `/videos/download` backend endpoints.
- Added: server unit tests for video format normalization and safe download filenames.
- Changed: server `check` now runs unit tests before syntax checks.
- Docs: updated README, project map, infrastructure and workflow documentation.

## 2026-06-15

- Added: initial `docs/agent/` self-documentation set.
- Documented: project map, infrastructure, ports, commands, env vars, runtime paths, API routes, data flow, and agent workflow.
- Ignored: local `.next/` generated artifacts so agent status checks stay focused.
- Verified: documentation was derived from current repository files and runtime scripts.
