import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { DEFAULT_API_BASE_URL, normalizeApiBaseUrl } from '../src/api-base-url.js';
import { ADD_VIDEO_BUTTON_LABEL } from '../src/video-library-action.js';
import { readYouTubeVideoMetadata } from '../src/youtube-video.js';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    if (document.getElementById('transcribator-extension-host')) return;

    let currentUrl = '';
    let currentAbortController: AbortController | null = null;

    const host = document.createElement('div');
    host.id = 'transcribator-extension-host';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
      }

      .button {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        border: 0;
        border-radius: 8px;
        background: #111827;
        color: #ffffff;
        cursor: pointer;
        font: 600 13px Arial, Helvetica, sans-serif;
        padding: 10px 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      }

      .button[hidden] {
        display: none;
      }

      .button:hover {
        background: #064e3b;
      }

      .button:disabled {
        background: #6b7280;
        cursor: default;
      }

      .button.added {
        background: #047857;
      }

      .button.error {
        background: #b91c1c;
      }
    `;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button';
    button.hidden = true;
    button.addEventListener('click', () => void addCurrentVideo(button));

    shadow.append(style, button);
    document.documentElement.append(host);

    void refreshButton(button);
    window.setInterval(() => {
      if (window.location.href !== currentUrl) {
        void refreshButton(button);
      }
    }, 1000);

    async function refreshButton(target: HTMLButtonElement): Promise<void> {
      currentUrl = window.location.href;
      currentAbortController?.abort();
      currentAbortController = new AbortController();

      const metadata = readYouTubeVideoMetadata();
      if (!metadata) {
        target.hidden = true;
        return;
      }

      target.hidden = false;
      setButtonState(target, 'checking');

      try {
        const apiBaseUrl = await readApiBaseUrl();
        const response = await fetch(
          `${apiBaseUrl}/videos/library/check?url=${encodeURIComponent(metadata.url)}`,
          { signal: currentAbortController.signal }
        );

        if (!response.ok) throw new Error(response.statusText || 'API error');
        const payload = await response.json() as { added?: boolean };
        setButtonState(target, payload.added ? 'added' : 'ready');
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setButtonState(target, 'error');
      }
    }

    async function addCurrentVideo(target: HTMLButtonElement): Promise<void> {
      const metadata = readYouTubeVideoMetadata();
      if (!metadata) return;

      setButtonState(target, 'adding');

      try {
        const apiBaseUrl = await readApiBaseUrl();
        const response = await fetch(`${apiBaseUrl}/videos/library`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: metadata.url,
            title: metadata.title,
            channelTitle: metadata.channelTitle,
            thumbnailUrl: metadata.thumbnailUrl
          })
        });

        if (!response.ok) throw new Error(response.statusText || 'API error');
        setButtonState(target, 'added');
      } catch {
        setButtonState(target, 'error');
      }
    }
  }
});

type ButtonState = 'checking' | 'ready' | 'adding' | 'added' | 'error';

function setButtonState(button: HTMLButtonElement, state: ButtonState): void {
  button.classList.toggle('added', state === 'added');
  button.classList.toggle('error', state === 'error');
  button.disabled = state === 'checking' || state === 'adding' || state === 'added';
  button.textContent = {
    checking: 'Проверяю...',
    ready: ADD_VIDEO_BUTTON_LABEL,
    adding: 'Загружаю данные...',
    added: 'Добавлено',
    error: 'Ошибка API'
  }[state];
}

async function readApiBaseUrl(): Promise<string> {
  const stored = await browser.storage.local.get(['transcribatorApiBaseUrl']);
  const apiBaseUrl = normalizeApiBaseUrl(stored.transcribatorApiBaseUrl, DEFAULT_API_BASE_URL);
  if (stored.transcribatorApiBaseUrl !== apiBaseUrl) {
    await browser.storage.local.set({ transcribatorApiBaseUrl: apiBaseUrl });
  }
  return apiBaseUrl;
}
