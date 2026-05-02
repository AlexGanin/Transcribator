import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const URL_STAGES = [
  { id: 'download', label: 'Download and convert audio' },
  { id: 'transcribe', label: 'Transcribe audio' },
  { id: 'postprocess', label: 'Post-process and save text' }
];

const FILE_STAGES = [
  { id: 'upload', label: 'Upload file' },
  { id: 'convert', label: 'Convert audio' },
  { id: 'transcribe', label: 'Transcribe audio' },
  { id: 'postprocess', label: 'Post-process and save text' }
];

const TRANSCRIPTION_ENGINES = [
  { value: 'mlx-whisper', label: 'MLX Whisper (Apple Silicon GPU)' },
  { value: 'openai-whisper', label: 'OpenAI Whisper local CPU' },
  { value: 'openai', label: 'OpenAI API' }
];

const STAGE_LABELS = {
  upload: 'Upload',
  download: 'Download',
  convert: 'Convert',
  transcribe: 'Transcribe',
  postprocess: 'Post-process'
};

function App() {
  const [sourceMode, setSourceMode] = useState('url');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [engine, setEngine] = useState('mlx-whisper');
  const [summary, setSummary] = useState('');
  const [cleanText, setCleanText] = useState('');
  const [rawText, setRawText] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [stages, setStages] = useState([]);
  const [history, setHistory] = useState([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (status !== 'running') {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const now = Date.now();
      setElapsedSeconds(Math.floor((now - startedAtRef.current) / 1000));
      setStages((currentStages) =>
        currentStages.map((stage) => {
          if (stage.status !== 'running') return stage;
          return {
            ...stage,
            elapsedSeconds: Math.floor((now - stage.startedAt) / 1000),
            progress: stage.indeterminate ? Math.min(95, stage.progress + 1) : stage.progress
          };
        })
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    loadHistory();

    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const isFileMode = sourceMode === 'file';
    const stageTemplate = isFileMode ? FILE_STAGES : URL_STAGES;

    eventSourceRef.current?.close();
    startedAtRef.current = Date.now();
    setStatus('running');
    setError('');
    setSummary('');
    setCleanText('');
    setRawText('');
    setOutputPath('');
    setElapsedSeconds(0);
    setStages(createStages(stageTemplate));

    try {
      const response = isFileMode
        ? await transcribeFile(file, engine, (uploadProgress) => updateStage('upload', uploadProgress, 'running', false))
        : await transcribeUrl(url, engine);

      if (isFileMode) {
        finishStage('upload');
      }

      subscribeToJob(response.data.jobId);
    } catch (err) {
      finishRun('error');
      setError(err.response?.data?.error || err.message || 'Transcription failed.');
    }
  }

  function subscribeToJob(jobId) {
    const eventSource = new EventSource(`${API_URL}/transcribe/jobs/${jobId}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (message) => {
      const event = JSON.parse(message.data);

      if (event.type === 'progress') {
        updateStage(event.stage, event.progress, event.progress >= 100 ? 'done' : 'running', event.stage === 'transcribe');
      }

      if (event.type === 'done') {
        completeAllStages();
        setSummary(event.result?.summary || '');
        setCleanText(event.result?.cleanText || event.result?.text || '');
        setRawText(event.result?.rawText || '');
        setOutputPath(event.result?.outputPath || '');
        finishRun('done');
        loadHistory();
        eventSourceRef.current = null;
        eventSource.close();
      }

      if (event.type === 'error') {
        finishRun('error');
        setError(event.error || 'Transcription failed.');
        loadHistory();
        eventSourceRef.current = null;
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      if (eventSourceRef.current === eventSource) {
        finishRun('error');
        setError('Lost connection to transcription progress stream.');
        eventSourceRef.current = null;
      }
      eventSource.close();
    };
  }

  function updateStage(stageId, progress, nextStatus, indeterminate) {
    const now = Date.now();

    setStages((currentStages) =>
      currentStages.map((stage) => {
        if (stage.id !== stageId) return stage;

        const startedAt = stage.startedAt || now;
        const isDone = nextStatus === 'done' || progress >= 100;
        return {
          ...stage,
          status: isDone ? 'done' : nextStatus,
          progress: Math.max(stage.progress, Math.min(100, progress)),
          indeterminate: Boolean(indeterminate && !isDone),
          startedAt,
          finishedAt: isDone ? stage.finishedAt || now : null,
          elapsedSeconds: Math.floor(((isDone ? stage.finishedAt || now : now) - startedAt) / 1000)
        };
      })
    );
  }

  function finishStage(stageId) {
    updateStage(stageId, 100, 'done', false);
  }

  function completeAllStages() {
    const now = Date.now();
    setStages((currentStages) =>
      currentStages.map((stage) => {
        const startedAt = stage.startedAt || now;
        const finishedAt = stage.finishedAt || now;
        return {
          ...stage,
          status: 'done',
          progress: 100,
          indeterminate: false,
          startedAt,
          finishedAt,
          elapsedSeconds: Math.floor((finishedAt - startedAt) / 1000)
        };
      })
    );
  }

  function finishRun(nextStatus) {
    setStatus(nextStatus);
    setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
  }

  async function loadHistory() {
    try {
      const response = await axios.get(`${API_URL}/transcribe/history`);
      setHistory(response.data.history || []);
    } catch {
      setHistory([]);
    }
  }

  function handleSourceModeChange(nextMode) {
    setSourceMode(nextMode);
    setUrl('');
    setFile(null);
  }

  const disabled = status === 'running' || (sourceMode === 'url' ? !url.trim() : !file);
  const showProgress = stages.length > 0 && status !== 'idle';

  return (
    <main className="page">
      <section className="panel">
        <h1>Transcribator</h1>
        <form onSubmit={handleSubmit} className="form">
          <fieldset className="radioGroup" disabled={status === 'running'}>
            <legend>Source</legend>
            <label className="radioOption">
              <input
                type="radio"
                name="source"
                value="url"
                checked={sourceMode === 'url'}
                onChange={() => handleSourceModeChange('url')}
              />
              URL
            </label>
            <label className="radioOption">
              <input
                type="radio"
                name="source"
                value="file"
                checked={sourceMode === 'file'}
                onChange={() => handleSourceModeChange('file')}
              />
              Local file
            </label>
          </fieldset>

          {sourceMode === 'url' ? (
            <label>
              URL
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={status === 'running'}
              />
            </label>
          ) : (
            <label>
              Local file
              <input
                type="file"
                accept="audio/*,video/*"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                disabled={status === 'running'}
              />
            </label>
          )}

          <label>
            Transcription engine
            <select value={engine} onChange={(event) => setEngine(event.target.value)} disabled={status === 'running'}>
              {TRANSCRIPTION_ENGINES.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" disabled={disabled}>
            {status === 'running' ? 'Transcribing...' : 'Transcribe'}
          </button>
        </form>

        {showProgress && (
          <section className="progressPanel" aria-live="polite">
            <div className="progressSummary">
              <span>{status === 'running' ? 'Running' : status === 'done' ? 'Completed' : 'Stopped'}</span>
              <span>Total: {formatElapsed(elapsedSeconds)}</span>
            </div>

            <div className="stageList">
              {stages.map((stage) => (
                <div className="stage" key={stage.id}>
                  <div className="progressMeta">
                    <span>{stage.label}</span>
                    <span>
                      {Math.round(stage.progress)}% · {formatElapsed(stage.elapsedSeconds)}
                    </span>
                  </div>
                  <div
                    className="progressTrack"
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={Math.round(stage.progress)}
                  >
                    <div className={`progressBar ${stage.status}`} style={{ width: `${stage.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {error && <p className="error">{error}</p>}
        {outputPath && <p className="saved">Saved to: {outputPath}</p>}

        <section className="resultStack">
          <label>
            Summary
            <textarea className="summaryText" value={summary} readOnly placeholder="Short summary will appear here." />
          </label>

          <label>
            Clean transcript
            <textarea value={cleanText} readOnly placeholder="Cleaned transcript will appear here." />
          </label>

          <label>
            Raw transcript
            <textarea value={rawText} readOnly placeholder="Raw transcription result will appear here." />
          </label>
        </section>

        <section className="history">
          <div className="historyHeader">
            <h2>History</h2>
            <button type="button" className="secondaryButton" onClick={loadHistory}>
              Refresh
            </button>
          </div>

          {history.length === 0 ? (
            <p className="muted">No completed runs yet.</p>
          ) : (
            <div className="historyList">
              {history.map((item) => (
                <article className="historyItem" key={item.id}>
                  <div className="historyTop">
                    <div>
                      <strong>{engineLabel(item.engine)}</strong>
                      <p>{item.source || item.sourceType}</p>
                    </div>
                    <div className="historyTime">
                      <span className={item.status === 'done' ? 'statusDone' : 'statusError'}>{item.status}</span>
                      <strong>{formatElapsed(item.elapsedSeconds)}</strong>
                    </div>
                  </div>

                  <div className="historyStages">
                    {item.stages.map((stage) => (
                      <span key={stage.id}>
                        {STAGE_LABELS[stage.id] || stage.id}: {formatElapsed(stage.elapsedSeconds)}
                      </span>
                    ))}
                  </div>

                  {item.error && <p className="error">{item.error}</p>}

                  {(item.summary || item.cleanText || item.rawText) && (
                    <details className="historyDetails">
                      <summary>Texts</summary>
                      {item.summary && (
                        <label>
                          Summary
                          <textarea className="historyText" value={item.summary} readOnly />
                        </label>
                      )}
                      {item.cleanText && (
                        <label>
                          Clean transcript
                          <textarea className="historyText" value={item.cleanText} readOnly />
                        </label>
                      )}
                      {item.rawText && (
                        <label>
                          Raw transcript
                          <textarea className="historyText" value={item.rawText} readOnly />
                        </label>
                      )}
                    </details>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function createStages(stageTemplate) {
  return stageTemplate.map((stage) => ({
    ...stage,
    status: 'pending',
    progress: 0,
    elapsedSeconds: 0,
    startedAt: null,
    finishedAt: null,
    indeterminate: false
  }));
}

function transcribeUrl(url, engine) {
  return axios.post(`${API_URL}/transcribe/url`, { url, engine }, { timeout: 0 });
}

function transcribeFile(file, engine, onUploadProgressPercent) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('engine', engine);
  return axios.post(`${API_URL}/transcribe/file`, formData, {
    timeout: 0,
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (!event.total) return;
      onUploadProgressPercent(Math.round((event.loaded / event.total) * 100));
    }
  });
}

function formatElapsed(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function engineLabel(value) {
  return TRANSCRIPTION_ENGINES.find((engine) => engine.value === value)?.label || value || 'Default engine';
}

createRoot(document.getElementById('root')).render(<App />);
