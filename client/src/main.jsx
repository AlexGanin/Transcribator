import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [outputPath, setOutputPath] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('running');
    setError('');
    setResult('');
    setOutputPath('');

    try {
      const response = file ? await transcribeFile(file) : await transcribeUrl(url);
      setResult(response.data.text || '');
      setOutputPath(response.data.outputPath || '');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.error || err.message || 'Transcription failed.');
    }
  }

  const disabled = status === 'running' || (!url.trim() && !file);

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

function transcribeUrl(url) {
  return axios.post(`${API_URL}/transcribe/url`, { url }, { timeout: 0 });
}

function transcribeFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post(`${API_URL}/transcribe/file`, formData, {
    timeout: 0,
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}

createRoot(document.getElementById('root')).render(<App />);
