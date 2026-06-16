'use client';

import * as React from 'react';
import { Download, FileAudio, Link2, Play, RefreshCw } from 'lucide-react';
import { ApiClientError, createApiClient } from '@transcribator/api-client';
import {
  progressEventSchema,
  type HistoryEntry,
  type ProgressEvent,
  type TranscriptionEngine,
  type VideoFormat
} from '@transcribator/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn
} from '@transcribator/ui';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

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

const TRANSCRIPTION_ENGINES: Array<{ value: TranscriptionEngine; label: string }> = [
  { value: 'mlx-whisper', label: 'MLX Whisper (Apple Silicon GPU)' },
  { value: 'openai-whisper', label: 'OpenAI Whisper local CPU' },
  { value: 'openai', label: 'OpenAI API' }
];

const STAGE_LABELS: Record<string, string> = {
  upload: 'Upload',
  download: 'Download',
  convert: 'Convert',
  transcribe: 'Transcribe',
  postprocess: 'Post-process'
};

type AppTab = 'transcribe' | 'download';
type SourceMode = 'url' | 'file';
type RunStatus = 'idle' | 'running' | 'done' | 'error';
type StageStatus = 'pending' | 'running' | 'done';

interface StageState {
  id: string;
  label: string;
  status: StageStatus;
  progress: number;
  elapsedSeconds: number;
  startedAt: number | null;
  finishedAt: number | null;
  indeterminate: boolean;
}

export function TranscribatorApp() {
  const api = React.useMemo(() => createApiClient({ baseUrl: API_BASE_URL }), []);
  const [activeTab, setActiveTab] = React.useState<AppTab>('transcribe');
  const [sourceMode, setSourceMode] = React.useState<SourceMode>('url');
  const [url, setUrl] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [engine, setEngine] = React.useState<TranscriptionEngine>('mlx-whisper');
  const [summary, setSummary] = React.useState('');
  const [cleanText, setCleanText] = React.useState('');
  const [rawText, setRawText] = React.useState('');
  const [status, setStatus] = React.useState<RunStatus>('idle');
  const [error, setError] = React.useState('');
  const [outputPath, setOutputPath] = React.useState('');
  const [stages, setStages] = React.useState<StageState[]>([]);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [videoUrl, setVideoUrl] = React.useState('');
  const [videoTitle, setVideoTitle] = React.useState('');
  const [videoFormats, setVideoFormats] = React.useState<VideoFormat[]>([]);
  const [selectedVideoFormatId, setSelectedVideoFormatId] = React.useState('');
  const [videoStatus, setVideoStatus] = React.useState<RunStatus | 'loading' | 'downloading'>('idle');
  const [videoError, setVideoError] = React.useState('');
  const [downloadedVideoPath, setDownloadedVideoPath] = React.useState('');
  const startedAtRef = React.useRef<number>(Date.now());
  const eventSourceRef = React.useRef<EventSource | null>(null);

  React.useEffect(() => {
    void loadHistory();

    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  React.useEffect(() => {
    if (status !== 'running') return undefined;

    const timer = window.setInterval(() => {
      const now = Date.now();
      setElapsedSeconds(Math.floor((now - startedAtRef.current) / 1000));
      setStages((currentStages) =>
        currentStages.map((stage) => {
          if (stage.status !== 'running' || stage.startedAt === null) return stage;

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isFileMode = sourceMode === 'file';
    if (isFileMode && !file) return;

    eventSourceRef.current?.close();
    startedAtRef.current = Date.now();
    setStatus('running');
    setError('');
    setSummary('');
    setCleanText('');
    setRawText('');
    setOutputPath('');
    setElapsedSeconds(0);
    setStages(createStages(isFileMode ? FILE_STAGES : URL_STAGES));

    try {
      if (isFileMode) {
        updateStage('upload', 15, 'running', true);
      }

      const response = isFileMode
        ? await api.transcribeFile(file as File, engine)
        : await api.transcribeUrl(url, engine);

      if (isFileMode) {
        finishStage('upload');
      }

      subscribeToJob(response.jobId);
    } catch (caught) {
      finishRun('error');
      setError(errorMessage(caught, 'Transcription failed.'));
    }
  }

  function subscribeToJob(jobId: string) {
    const eventSource = new EventSource(api.jobEventsUrl(jobId));
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (message) => {
      const event = parseProgressEvent(message.data);
      if (!event) return;

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
        void loadHistory();
        eventSourceRef.current = null;
        eventSource.close();
      }

      if (event.type === 'error') {
        finishRun('error');
        setError(event.error || 'Transcription failed.');
        void loadHistory();
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

  function updateStage(stageId: string, progress: number, nextStatus: StageStatus, indeterminate: boolean) {
    const now = Date.now();

    setStages((currentStages) =>
      currentStages.map((stage) => {
        if (stage.id !== stageId) return stage;

        const startedAt = stage.startedAt || now;
        const isDone = nextStatus === 'done' || progress >= 100;
        const finishedAt = isDone ? stage.finishedAt || now : null;

        return {
          ...stage,
          status: isDone ? 'done' : nextStatus,
          progress: Math.max(stage.progress, Math.min(100, progress)),
          indeterminate: Boolean(indeterminate && !isDone),
          startedAt,
          finishedAt,
          elapsedSeconds: Math.floor(((finishedAt || now) - startedAt) / 1000)
        };
      })
    );
  }

  function finishStage(stageId: string) {
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

  function finishRun(nextStatus: Exclude<RunStatus, 'idle' | 'running'>) {
    setStatus(nextStatus);
    setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
  }

  async function loadHistory() {
    try {
      const response = await api.getHistory();
      setHistory(response.history || []);
    } catch {
      setHistory([]);
    }
  }

  function handleSourceModeChange(nextMode: SourceMode) {
    setSourceMode(nextMode);
    setUrl('');
    setFile(null);
  }

  function handleVideoUrlChange(nextUrl: string) {
    setVideoUrl(nextUrl);
    setVideoTitle('');
    setVideoFormats([]);
    setSelectedVideoFormatId('');
    setDownloadedVideoPath('');
    setVideoError('');
    setVideoStatus('idle');
  }

  async function handleLoadVideoFormats(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVideoStatus('loading');
    setVideoError('');
    setDownloadedVideoPath('');
    setVideoFormats([]);
    setSelectedVideoFormatId('');

    try {
      const response = await api.getVideoFormats(videoUrl);
      setVideoTitle(response.title || '');
      setVideoFormats(response.formats || []);
      setSelectedVideoFormatId(response.formats[0]?.id || '');
      setVideoStatus(response.formats.length > 0 ? 'done' : 'idle');

      if (response.formats.length === 0) {
        setVideoError('Не удалось найти видеоформаты для этого ролика.');
      }
    } catch (caught) {
      setVideoStatus('error');
      setVideoError(errorMessage(caught, 'Не удалось получить варианты скачивания.'));
    }
  }

  async function handleDownloadVideo() {
    setVideoStatus('downloading');
    setVideoError('');
    setDownloadedVideoPath('');

    try {
      const response = await api.downloadVideo(videoUrl, selectedVideoFormatId);
      setDownloadedVideoPath(response.outputPath || '');
      setVideoStatus('done');
    } catch (caught) {
      setVideoStatus('error');
      setVideoError(errorMessage(caught, 'Не удалось скачать видео.'));
    }
  }

  const disabled = status === 'running' || (sourceMode === 'url' ? !url.trim() : !file);
  const showProgress = stages.length > 0 && status !== 'idle';
  const videoBusy = videoStatus === 'loading' || videoStatus === 'downloading';
  const canLoadVideoFormats = Boolean(videoUrl.trim()) && !videoBusy;
  const canDownloadVideo = Boolean(videoUrl.trim() && selectedVideoFormatId) && !videoBusy;

  return (
    <main className="min-h-screen px-4 py-8 text-neutral-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6">
        <header className="flex flex-col gap-2 border-b border-neutral-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Transcribator</h1>
            <p className="mt-1 text-sm text-neutral-600">API: {API_BASE_URL}</p>
          </div>
          <Badge variant={status === 'running' ? 'secondary' : status === 'error' ? 'error' : 'success'}>
            {statusLabel(status)}
          </Badge>
        </header>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AppTab)} className="w-full">
          <TabsList aria-label="App sections">
            <TabsTrigger value="transcribe">Транскрибатор</TabsTrigger>
            <TabsTrigger value="download">Скачать видео</TabsTrigger>
          </TabsList>

          <TabsContent value="transcribe">
            <section className="grid gap-6">
              <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={sourceMode === 'url' ? 'default' : 'secondary'}
                    onClick={() => handleSourceModeChange('url')}
                    disabled={status === 'running'}
                  >
                    <Link2 className="h-4 w-4" />
                    URL
                  </Button>
                  <Button
                    type="button"
                    variant={sourceMode === 'file' ? 'default' : 'secondary'}
                    onClick={() => handleSourceModeChange('file')}
                    disabled={status === 'running'}
                  >
                    <FileAudio className="h-4 w-4" />
                    Local file
                  </Button>
                </div>

                {sourceMode === 'url' ? (
                  <label className="grid gap-2 text-sm font-medium">
                    URL
                    <Input
                      key="url-source-input"
                      type="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      disabled={status === 'running'}
                    />
                  </label>
                ) : (
                  <label className="grid gap-2 text-sm font-medium">
                    Local file
                    <Input
                      key="file-source-input"
                      type="file"
                      accept="audio/*,video/*"
                      onChange={(event) => setFile(event.target.files?.[0] || null)}
                      disabled={status === 'running'}
                    />
                  </label>
                )}

                <label className="grid gap-2 text-sm font-medium">
                  Transcription engine
                  <Select
                    value={engine}
                    onValueChange={(value) => setEngine(value as TranscriptionEngine)}
                    disabled={status === 'running'}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSCRIPTION_ENGINES.map((option) => (
                        <SelectItem value={option.value} key={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <Button type="submit" disabled={disabled} className="w-fit">
                  <Play className="h-4 w-4" />
                  {status === 'running' ? 'Transcribing...' : 'Transcribe'}
                </Button>
              </form>

              {showProgress && <ProgressPanel stages={stages} status={status} elapsedSeconds={elapsedSeconds} />}

              {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p>}
              {outputPath && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  Saved to: {outputPath}
                </p>
              )}

              <section className="grid gap-4">
                <label className="grid gap-2 text-sm font-medium">
                  Summary
                  <Textarea className="min-h-36" value={summary} readOnly placeholder="Short summary will appear here." />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Clean transcript
                  <Textarea className="min-h-72" value={cleanText} readOnly placeholder="Cleaned transcript will appear here." />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Raw transcript
                  <Textarea className="min-h-72" value={rawText} readOnly placeholder="Raw transcription result will appear here." />
                </label>
              </section>

              <section className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">History</h2>
                  <Button type="button" variant="secondary" onClick={() => void loadHistory()}>
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>
                </div>

                {history.length === 0 ? (
                  <p className="text-sm text-neutral-600">No completed runs yet.</p>
                ) : (
                  <div className="grid gap-3">
                    {history.map((item) => (
                      <HistoryItem item={item} key={item.id} />
                    ))}
                  </div>
                )}
              </section>
            </section>
          </TabsContent>

          <TabsContent value="download">
            <section className="grid gap-5">
              <form onSubmit={handleLoadVideoFormats} className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <label className="grid gap-2 text-sm font-medium">
                  YouTube URL
                  <Input
                    type="url"
                    value={videoUrl}
                    onChange={(event) => handleVideoUrlChange(event.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={videoBusy}
                  />
                </label>

                <Button type="submit" disabled={!canLoadVideoFormats} className="w-fit">
                  <RefreshCw className={cn('h-4 w-4', videoStatus === 'loading' && 'animate-spin')} />
                  {videoStatus === 'loading' ? 'Получаю варианты...' : 'Получить варианты'}
                </Button>
              </form>

              {videoTitle && (
                <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                  <h2 className="text-lg font-semibold break-words">{videoTitle}</h2>
                  <label className="grid gap-2 text-sm font-medium">
                    Разрешение и формат
                    <Select value={selectedVideoFormatId} onValueChange={setSelectedVideoFormatId} disabled={videoBusy}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {videoFormats.map((format) => (
                          <SelectItem value={format.id} key={format.id}>
                            {format.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <Button type="button" onClick={handleDownloadVideo} disabled={!canDownloadVideo} className="w-fit">
                    <Download className="h-4 w-4" />
                    {videoStatus === 'downloading' ? 'Скачиваю...' : 'Скачать'}
                  </Button>
                </section>
              )}

              {videoError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{videoError}</p>
              )}
              {downloadedVideoPath && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  Видео сохранено: {downloadedVideoPath}
                </p>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function ProgressPanel({ stages, status, elapsedSeconds }: { stages: StageState[]; status: RunStatus; elapsedSeconds: number }) {
  return (
    <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium">
        <span>{status === 'running' ? 'Running' : status === 'done' ? 'Completed' : 'Stopped'}</span>
        <span>Total: {formatElapsed(elapsedSeconds)}</span>
      </div>
      <div className="grid gap-4">
        {stages.map((stage) => (
          <div className="grid gap-2" key={stage.id}>
            <div className="flex items-center justify-between gap-3 text-sm font-medium">
              <span>{stage.label}</span>
              <span>
                {Math.round(stage.progress)}% · {formatElapsed(stage.elapsedSeconds)}
              </span>
            </div>
            <Progress value={stage.progress} aria-label={stage.label} />
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryItem({ item }: { item: HistoryEntry }) {
  return (
    <Card>
      <CardHeader className="grid gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{engineLabel(item.engine)}</CardTitle>
          <p className="mt-1 break-words text-sm text-neutral-600">{item.source || item.sourceType}</p>
        </div>
        <div className="grid justify-items-start gap-1 sm:justify-items-end">
          <Badge variant={item.status === 'done' ? 'success' : 'error'}>{item.status}</Badge>
          <strong className="text-sm">{formatElapsed(item.elapsedSeconds)}</strong>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {item.stages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.stages.map((stage) => (
              <Badge variant="secondary" key={stage.id}>
                {STAGE_LABELS[stage.id] || stage.id}: {formatElapsed(stage.elapsedSeconds)}
              </Badge>
            ))}
          </div>
        )}

        {item.error && <p className="text-sm font-medium text-red-700">{item.error}</p>}

        {(item.summary || item.cleanText || item.rawText) && (
          <details className="grid gap-3 text-sm">
            <summary className="cursor-pointer font-medium">Texts</summary>
            <div className="mt-3 grid gap-3">
              {item.summary && (
                <label className="grid gap-2 font-medium">
                  Summary
                  <Textarea className="min-h-32" value={item.summary} readOnly />
                </label>
              )}
              {item.cleanText && (
                <label className="grid gap-2 font-medium">
                  Clean transcript
                  <Textarea className="min-h-32" value={item.cleanText} readOnly />
                </label>
              )}
              {item.rawText && (
                <label className="grid gap-2 font-medium">
                  Raw transcript
                  <Textarea className="min-h-32" value={item.rawText} readOnly />
                </label>
              )}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function createStages(stageTemplate: Array<{ id: string; label: string }>): StageState[] {
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

function parseProgressEvent(data: string): ProgressEvent | null {
  try {
    const parsed = progressEventSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function engineLabel(value?: string) {
  return TRANSCRIPTION_ENGINES.find((engine) => engine.value === value)?.label || value || 'Default engine';
}

function statusLabel(status: RunStatus) {
  if (status === 'running') return 'Running';
  if (status === 'done') return 'Ready';
  if (status === 'error') return 'Error';
  return 'Idle';
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) return error.details.error;
  if (error instanceof Error) return error.message;
  return fallback;
}
