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

function App() {
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [stages, setStages] = useState([]);
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
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const stageTemplate = file ? FILE_STAGES : URL_STAGES;

    eventSourceRef.current?.close();
    startedAtRef.current = Date.now();
    setStatus('running');
    setError('');
    setResult('');
    setOutputPath('');
    setElapsedSeconds(0);
    setStages(createStages(stageTemplate));

    try {
      const response = file
        ? await transcribeFile(file, (uploadProgress) => updateStage('upload', uploadProgress, 'running', false))
        : await transcribeUrl(url);

      if (file) {
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
        setResult(event.result?.text || '');
        setOutputPath(event.result?.outputPath || '');
        finishRun('done');
        eventSourceRef.current = null;
        eventSource.close();
      }

      if (event.type === 'error') {
        finishRun('error');
        setError(event.error || 'Transcription failed.');
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

  const disabled = status === 'running' || (!url.trim() && !file);
  const showProgress = stages.length > 0 && status !== 'idle';

  return (
    <main className="page">
      <section className="panel">
        <h1>Transcribator</h1>
        <form onSubmit={handleSubmit} className="form">
          <label>
            URL
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              disabled={Boolean(file) || status === 'running'}
            />
          </label>

          <label>
            Local file
            <input
              type="file"
              accept="audio/*,video/*"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              disabled={status === 'running'}
            />
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

        <label className="result">
          Result
          <textarea value={result} readOnly placeholder="Transcription result will appear here." />
        </label>
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

function transcribeUrl(url) {
  return axios.post(`${API_URL}/transcribe/url`, { url }, { timeout: 0 });
}

function transcribeFile(file, onUploadProgressPercent) {
  const formData = new FormData();
  formData.append('file', file);
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

createRoot(document.getElementById('root')).render(<App />);
