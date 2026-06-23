import * as React from 'react';
import { browser } from 'wxt/browser';
import { ApiClientError, createApiClient } from '@transcribator/api-client';
import type { TranscriptionEngine } from '@transcribator/shared';

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:2001';
const ENGINES: Array<{ value: TranscriptionEngine; label: string }> = [
  { value: 'mlx-whisper', label: 'MLX Whisper' },
  { value: 'openai-whisper', label: 'OpenAI Whisper' },
  { value: 'openai', label: 'OpenAI API' }
];

export function PopupApp() {
  const [apiBaseUrl, setApiBaseUrl] = React.useState(DEFAULT_API_BASE_URL);
  const [url, setUrl] = React.useState('');
  const [engine, setEngine] = React.useState<TranscriptionEngine>('mlx-whisper');
  const [status, setStatus] = React.useState('Idle');
  const api = React.useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  React.useEffect(() => {
    void browser.storage.local.get(['transcribatorApiBaseUrl', 'transcribatorLastYouTubeUrl']).then((stored) => {
      if (typeof stored.transcribatorApiBaseUrl === 'string') {
        setApiBaseUrl(stored.transcribatorApiBaseUrl);
      }
      if (typeof stored.transcribatorLastYouTubeUrl === 'string') {
        setUrl(stored.transcribatorLastYouTubeUrl);
      }
    });
  }, []);

  async function useCurrentTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      setUrl(tab.url);
      await browser.storage.local.set({ transcribatorLastYouTubeUrl: tab.url });
    }
  }

  async function checkApi() {
    setStatus('Checking API...');
    try {
      await api.health();
      setStatus('API is reachable');
    } catch (caught) {
      setStatus(errorMessage(caught, 'API is not reachable'));
    }
  }

  async function startTranscription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('Starting job...');
    try {
      const response = await api.transcribeUrl(url, engine);
      setStatus(`Job started: ${response.jobId}`);
    } catch (caught) {
      setStatus(errorMessage(caught, 'Could not start job'));
    }
  }

  return (
    <main className="popup">
      <header>
        <h1>Transcribator</h1>
        <button type="button" onClick={checkApi}>
          Check API
        </button>
      </header>

      <form onSubmit={startTranscription}>
        <label>
          API URL
          <input
            value={apiBaseUrl}
            onChange={(event) => {
              setApiBaseUrl(event.target.value);
              void browser.storage.local.set({ transcribatorApiBaseUrl: event.target.value });
            }}
          />
        </label>

        <label>
          YouTube URL
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
        </label>

        <label>
          Engine
          <select value={engine} onChange={(event) => setEngine(event.target.value as TranscriptionEngine)}>
            {ENGINES.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="actions">
          <button type="button" className="secondary" onClick={useCurrentTab}>
            Current tab
          </button>
          <button type="submit" disabled={!url.trim()}>
            Transcribe
          </button>
        </div>
      </form>

      <p className="status">{status}</p>
    </main>
  );
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) return error.details.error;
  if (error instanceof Error) return error.message;
  return fallback;
}
