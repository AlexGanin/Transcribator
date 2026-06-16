# Video Download Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Скачать видео` tab that lists YouTube video formats and downloads the selected video into `downloads/`.

**Architecture:** Keep transcription behavior intact. Add a focused server module for `yt-dlp` format discovery and downloads, expose two Express routes, and add a second React tab in the existing Vite client.

**Tech Stack:** React, Vite, Express, Node.js `node:test`, `yt-dlp`.

---

### Task 1: Server Download Module

**Files:**
- Create: `server/src/videoDownload.js`
- Create: `server/src/videoDownload.test.js`
- Modify: `server/package.json`

- [ ] Add tests for `normalizeFormats()` and `safeDownloadFileName()`.
- [ ] Run `npm run test --prefix server` and verify the tests fail because the module does not exist.
- [ ] Implement URL validation, format normalization, filename safety, format lookup, and download helpers.
- [ ] Run `npm run test --prefix server` and verify the tests pass.

### Task 2: Express Endpoints And Runtime Directory

**Files:**
- Modify: `server/src/index.js`
- Modify: `.gitignore`
- Create: `downloads/.gitkeep`

- [ ] Ensure `downloads/` exists at server startup.
- [ ] Add `POST /videos/formats`.
- [ ] Add `POST /videos/download`.
- [ ] Ignore downloaded files while keeping `downloads/.gitkeep`.
- [ ] Run `npm run check --prefix server`.

### Task 3: Client Tabs And Download UI

**Files:**
- Modify: `client/src/main.jsx`
- Modify: `client/src/styles.css`

- [ ] Add `activeTab` state.
- [ ] Wrap the current transcription UI into the `Транскрибатор` tab.
- [ ] Add the `Скачать видео` tab UI.
- [ ] Add API helpers for `/videos/formats` and `/videos/download`.
- [ ] Run `npm run build --prefix client`.

### Task 4: Documentation And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/agent/PROJECT_MAP.md`
- Modify: `docs/agent/INFRASTRUCTURE.md`
- Modify: `docs/agent/CHANGELOG.md`

- [ ] Document `downloads/`, endpoints, and UI tabs.
- [ ] Run `npm run check`.
- [ ] Run `git diff --check`.
