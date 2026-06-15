# Agent Documentation

This directory is the project self-documentation layer for agentic work on Transcribator.
Read it before making non-trivial changes, and keep it current after every meaningful edit.

## Start Here

- `PROJECT_MAP.md` explains the repository layout, file ownership, and runtime data flow.
- `INFRASTRUCTURE.md` explains ports, commands, environment variables, external tools, and runtime directories.
- `WORKFLOW.md` explains how agents should inspect, edit, verify, document, and commit work.
- `CHANGELOG.md` is the agent-facing log of structural and behavioral changes.

## Project Summary

Transcribator is a local transcription app with two running parts:

- `client/`: React + Vite browser UI on `http://localhost:3002`.
- `server/`: Express API on `http://localhost:3001`.

The backend transcribes URL or uploaded media through external tools such as `yt-dlp`, `ffmpeg`,
`whisper`, `mlx_whisper`, or the OpenAI Audio Transcriptions API. Runtime files are written under
`source/`, `tmp/`, and `output/`.

## Documentation Update Rule

When a change affects project behavior, update at least one of these files:

- Update `PROJECT_MAP.md` when files, folders, APIs, or responsibilities change.
- Update `INFRASTRUCTURE.md` when ports, commands, env vars, external tools, or runtime paths change.
- Update `WORKFLOW.md` when the preferred agent process or verification steps change.
- Append `CHANGELOG.md` for every meaningful agent-visible change.

Small typo fixes do not need a changelog entry unless they clarify important behavior.
