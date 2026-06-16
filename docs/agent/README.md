# Agent Documentation

This directory is the project self-documentation layer for agentic work on Transcribator.
Read it before making non-trivial changes, and keep it current after every meaningful edit.

## Start Here

- `PROJECT_MAP.md` explains repository layout, file ownership and runtime data flow.
- `INFRASTRUCTURE.md` explains ports, commands, environment variables, external tools and runtime directories.
- `WORKFLOW.md` explains how agents should inspect, edit, verify, document and commit work.
- `CHANGELOG.md` is the agent-facing log of structural and behavioral changes.

## Project Summary

Transcribator is now a pnpm workspace:

- `apps/api`: Express API on `http://localhost:3001`.
- `apps/crm`: Next.js CRM on `http://localhost:3002`.
- `apps/extension`: WXT React Manifest V3 extension.
- `packages/shared`: Zod contracts and shared DTO types.
- `packages/api-client`: fetch client used by browser surfaces.
- `packages/ui`: shared shadcn-style React UI components.

The Express API remains the owner of media work: `yt-dlp`, `ffmpeg`, Whisper engines, uploads, SSE progress, history and video downloads. Runtime files stay in root-level `source/`, `tmp/`, `output/` and `downloads/`.

## Documentation Update Rule

When a change affects project behavior, update at least one of these files:

- Update `PROJECT_MAP.md` when files, folders, APIs, or responsibilities change.
- Update `INFRASTRUCTURE.md` when ports, commands, env vars, external tools, or runtime paths change.
- Update `WORKFLOW.md` when the preferred agent process or verification steps change.
- Append `CHANGELOG.md` for every meaningful agent-visible change.

Small typo fixes do not need a changelog entry unless they clarify important behavior.
