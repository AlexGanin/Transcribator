'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileAudio,
  FileText,
  FileVideo,
  ImageOff,
  Images,
  Link2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  X
} from 'lucide-react';
import { ApiClientError, createApiClient } from '@transcribator/api-client';
import {
  progressEventSchema,
  type HistoryDetailResponse,
  type HistoryEntry,
  type HistoryScreenshot,
  type ProgressEvent,
  type TranscriptionEngine,
  type UpdateHistoryEntryRequest,
  type VideoCompressionPreset,
  type VideoCompressionResult,
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
  Textarea,
  cn
} from '@transcribator/ui';
import {
  buildHistoryDetailPath,
  crmNavigationItems,
  type AppView
} from './crm-navigation';
import {
  chooseNextLightboxIndex,
  getRestoredLightboxIndex,
  getAdjacentLightboxIndex,
  isLightboxDeleteKey,
  isLightboxUndoKey,
  type LightboxDirection
} from './history-lightbox-navigation';

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

const COMPRESSION_STAGES = [
  { id: 'probe', label: 'Подготовка видео' },
  { id: 'compress', label: 'Сжатие видео' }
];

const TRANSCRIPTION_ENGINES: Array<{ value: TranscriptionEngine; label: string }> = [
  { value: 'mlx-whisper', label: 'MLX Whisper (Apple Silicon GPU)' },
  { value: 'openai-whisper', label: 'OpenAI Whisper local CPU' },
  { value: 'openai', label: 'OpenAI API' }
];

const COMPRESSION_PRESETS: Array<{ value: VideoCompressionPreset; label: string }> = [
  { value: 'high', label: 'Высокое качество' },
  { value: 'balanced', label: 'Баланс' },
  { value: 'small', label: 'Минимальный размер' }
];

const STAGE_LABELS: Record<string, string> = {
  upload: 'Upload',
  download: 'Download',
  convert: 'Convert',
  transcribe: 'Transcribe',
  postprocess: 'Post-process',
  screenshots: 'Скриншоты',
  obsidian: 'Obsidian',
  probe: 'Подготовка',
  compress: 'Сжатие'
};

type SourceMode = 'url' | 'file';
type RunStatus = 'idle' | 'running' | 'done' | 'error';
type StageStatus = 'pending' | 'running' | 'done';
type ScreenshotScope = 'active' | 'trash';
type HistoryAction = '' | 'trash' | 'restore' | 'clear' | 'format' | 'markdown';

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

interface HistoryEditForm {
  title: string;
  source: string;
  engine: string;
  summary: string;
  formattedText: string;
  cleanText: string;
  rawText: string;
}

interface LightboxState {
  scope: ScreenshotScope;
  index: number;
}

interface LastLightboxTrash {
  entryId: string;
  fileName: string;
}

interface TranscribatorAppProps {
  view?: AppView;
  historyEntryId?: string;
}

export function TranscribatorApp({ view = 'transcribe', historyEntryId }: TranscribatorAppProps) {
  const router = useRouter();
  const api = React.useMemo(() => createApiClient({ baseUrl: API_BASE_URL }), []);
  const [sourceMode, setSourceMode] = React.useState<SourceMode>('url');
  const [url, setUrl] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [engine, setEngine] = React.useState<TranscriptionEngine>('mlx-whisper');
  const [summary, setSummary] = React.useState('');
  const [formattedText, setFormattedText] = React.useState('');
  const [cleanText, setCleanText] = React.useState('');
  const [rawText, setRawText] = React.useState('');
  const [status, setStatus] = React.useState<RunStatus>('idle');
  const [error, setError] = React.useState('');
  const [markdownPath, setMarkdownPath] = React.useState('');
  const [screenshotsCount, setScreenshotsCount] = React.useState(0);
  const [screenshotsEnabled, setScreenshotsEnabled] = React.useState(false);
  const [screenshotIntervalSeconds, setScreenshotIntervalSeconds] = React.useState(30);
  const [stages, setStages] = React.useState<StageState[]>([]);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [historyDetail, setHistoryDetail] = React.useState<HistoryDetailResponse | null>(null);
  const [historyForm, setHistoryForm] = React.useState<HistoryEditForm>(createHistoryEditForm());
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historySaving, setHistorySaving] = React.useState(false);
  const [historyAction, setHistoryAction] = React.useState<HistoryAction>('');
  const [historyError, setHistoryError] = React.useState('');
  const [selectedActiveScreenshots, setSelectedActiveScreenshots] = React.useState<string[]>([]);
  const [selectedTrashedScreenshots, setSelectedTrashedScreenshots] = React.useState<string[]>([]);
  const [lightbox, setLightbox] = React.useState<LightboxState | null>(null);
  const [lastLightboxTrash, setLastLightboxTrash] = React.useState<LastLightboxTrash | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [videoUrl, setVideoUrl] = React.useState('');
  const [videoTitle, setVideoTitle] = React.useState('');
  const [videoFormats, setVideoFormats] = React.useState<VideoFormat[]>([]);
  const [selectedVideoFormatId, setSelectedVideoFormatId] = React.useState('');
  const [videoStatus, setVideoStatus] = React.useState<RunStatus | 'loading' | 'downloading'>('idle');
  const [videoError, setVideoError] = React.useState('');
  const [downloadedVideoPath, setDownloadedVideoPath] = React.useState('');
  const [compressionFile, setCompressionFile] = React.useState<File | null>(null);
  const [compressionPreset, setCompressionPreset] = React.useState<VideoCompressionPreset>('balanced');
  const [compressionStatus, setCompressionStatus] = React.useState<RunStatus>('idle');
  const [compressionError, setCompressionError] = React.useState('');
  const [compressionStages, setCompressionStages] = React.useState<StageState[]>([]);
  const [compressionElapsedSeconds, setCompressionElapsedSeconds] = React.useState(0);
  const [compressionResult, setCompressionResult] = React.useState<VideoCompressionResult | null>(null);
  const startedAtRef = React.useRef<number>(Date.now());
  const compressionStartedAtRef = React.useRef<number>(Date.now());
  const eventSourceRef = React.useRef<EventSource | null>(null);
  const compressionEventSourceRef = React.useRef<EventSource | null>(null);
  const lightboxDeleteInFlightRef = React.useRef(false);

  React.useEffect(() => {
    void loadHistory();

    return () => {
      eventSourceRef.current?.close();
      compressionEventSourceRef.current?.close();
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

  React.useEffect(() => {
    if (compressionStatus !== 'running') return undefined;

    const timer = window.setInterval(() => {
      const now = Date.now();
      setCompressionElapsedSeconds(Math.floor((now - compressionStartedAtRef.current) / 1000));
      setCompressionStages((currentStages) =>
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
  }, [compressionStatus]);

  React.useEffect(() => {
    if (!lightbox) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLightbox(null);
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateLightbox('previous');
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateLightbox('next');
      }

      if (isLightboxDeleteKey(event.key) && lightbox.scope === 'active') {
        event.preventDefault();
        void trashLightboxScreenshot();
      }

      if (isLightboxUndoKey(event.key, event.metaKey, event.code)) {
        event.preventDefault();
        void restoreLastLightboxScreenshot();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyDetail, historyAction, lastLightboxTrash, lightbox]);

  React.useEffect(() => {
    if (view !== 'history') {
      setHistoryError('');
      setLightbox(null);
      setLastLightboxTrash(null);
      return;
    }

    if (historyEntryId) {
      void openHistoryDetail(historyEntryId);
      return;
    }

    setHistoryDetail(null);
    setHistoryError('');
    setSelectedActiveScreenshots([]);
    setSelectedTrashedScreenshots([]);
    setLightbox(null);
    setLastLightboxTrash(null);
  }, [view, historyEntryId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isFileMode = sourceMode === 'file';
    if (isFileMode && !file) return;

    eventSourceRef.current?.close();
    startedAtRef.current = Date.now();
    setStatus('running');
    setError('');
    setSummary('');
    setFormattedText('');
    setCleanText('');
    setRawText('');
    setMarkdownPath('');
    setScreenshotsCount(0);
    setElapsedSeconds(0);
    setStages(createStages(buildTranscriptionStages(isFileMode, screenshotsEnabled)));

    try {
      if (isFileMode) {
        updateStage('upload', 15, 'running', true);
      }

      const response = isFileMode
        ? await api.transcribeFile(file as File, engine, {
          screenshotsEnabled,
          screenshotIntervalSeconds
        })
        : await api.transcribeUrl(url, engine, {
          screenshotsEnabled,
          screenshotIntervalSeconds
        });

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
        setFormattedText(event.result?.formattedText || '');
        setCleanText(event.result?.cleanText || event.result?.text || '');
        setRawText(event.result?.rawText || '');
        setMarkdownPath(event.result?.markdownPath || '');
        setScreenshotsCount(event.result?.screenshotsCount || 0);
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

  async function loadHistory(options: { showLoading?: boolean; showError?: boolean } = {}) {
    if (options.showLoading) {
      setHistoryLoading(true);
    }
    if (options.showError) {
      setHistoryError('');
    }

    try {
      const response = await api.getHistory();
      setHistory(response.history || []);
    } catch (caught) {
      setHistory([]);
      if (options.showError) {
        setHistoryError(errorMessage(caught, 'Не удалось загрузить историю.'));
      }
    } finally {
      if (options.showLoading) {
        setHistoryLoading(false);
      }
    }
  }

  async function openHistoryDetail(id: string) {
    setHistoryLoading(true);
    setHistoryError('');
    setHistoryDetail(null);

    try {
      applyHistoryDetail(await api.getHistoryEntry(id));
    } catch (caught) {
      setHistoryError(errorMessage(caught, 'Не удалось открыть запись истории.'));
    } finally {
      setHistoryLoading(false);
    }
  }

  function applyHistoryDetail(detail: HistoryDetailResponse) {
    setHistoryDetail(detail);
    setHistoryForm(createHistoryEditForm(detail.entry));
    setSelectedActiveScreenshots([]);
    setSelectedTrashedScreenshots([]);
    setLightbox(null);
  }

  function closeHistoryDetail() {
    setHistoryDetail(null);
    setHistoryError('');
    setSelectedActiveScreenshots([]);
    setSelectedTrashedScreenshots([]);
    setLightbox(null);
    setLastLightboxTrash(null);
    router.push('/history');
  }

  async function saveHistoryDetail() {
    if (!historyDetail) return;

    setHistorySaving(true);
    setHistoryError('');

    try {
      const patch: UpdateHistoryEntryRequest = {
        title: historyForm.title,
        source: historyForm.source,
        engine: historyForm.engine,
        summary: historyForm.summary,
        formattedText: historyForm.formattedText,
        cleanText: historyForm.cleanText,
        rawText: historyForm.rawText
      };
      applyHistoryDetail(await api.updateHistoryEntry(historyDetail.entry.id, patch));
      await loadHistory();
    } catch (caught) {
      setHistoryError(errorMessage(caught, 'Не удалось сохранить изменения.'));
    } finally {
      setHistorySaving(false);
    }
  }

  async function trashSelectedScreenshots() {
    if (!historyDetail || selectedActiveScreenshots.length === 0) return;

    setHistoryAction('trash');
    setHistoryError('');

    try {
      applyHistoryDetail(await api.trashHistoryScreenshots(historyDetail.entry.id, selectedActiveScreenshots));
      await loadHistory();
    } catch (caught) {
      setHistoryError(errorMessage(caught, 'Не удалось перенести скриншоты в корзину.'));
    } finally {
      setHistoryAction('');
    }
  }

  async function formatHistoryDetail() {
    if (!historyDetail) return;

    setHistoryAction('format');
    setHistoryError('');

    try {
      applyHistoryDetail(await api.formatHistoryEntry(historyDetail.entry.id));
      await loadHistory();
    } catch (caught) {
      setHistoryError(errorMessage(caught, 'Не удалось выполнить нейроформатирование.'));
    } finally {
      setHistoryAction('');
    }
  }

  async function createHistoryMarkdown() {
    if (!historyDetail) return;

    setHistoryAction('markdown');
    setHistoryError('');

    try {
      applyHistoryDetail(await api.createHistoryMarkdown(historyDetail.entry.id));
      await loadHistory();
    } catch (caught) {
      setHistoryError(errorMessage(caught, 'Не удалось создать Markdown.'));
    } finally {
      setHistoryAction('');
    }
  }

  async function restoreSelectedScreenshots() {
    if (!historyDetail || selectedTrashedScreenshots.length === 0) return;

    setHistoryAction('restore');
    setHistoryError('');

    try {
      applyHistoryDetail(await api.restoreHistoryScreenshots(historyDetail.entry.id, selectedTrashedScreenshots));
      if (lastLightboxTrash && selectedTrashedScreenshots.includes(lastLightboxTrash.fileName)) {
        setLastLightboxTrash(null);
      }
      await loadHistory();
    } catch (caught) {
      setHistoryError(errorMessage(caught, 'Не удалось восстановить скриншоты.'));
    } finally {
      setHistoryAction('');
    }
  }

  async function clearScreenshotsTrash() {
    if (!historyDetail || historyDetail.trashedScreenshots.length === 0) return;
    const confirmed = window.confirm('Окончательно удалить все скриншоты из корзины? Это действие нельзя отменить.');
    if (!confirmed) return;

    setHistoryAction('clear');
    setHistoryError('');

    try {
      applyHistoryDetail(await api.clearHistoryScreenshotsTrash(historyDetail.entry.id));
      setLastLightboxTrash(null);
      await loadHistory();
    } catch (caught) {
      setHistoryError(errorMessage(caught, 'Не удалось очистить корзину.'));
    } finally {
      setHistoryAction('');
    }
  }

  function updateHistoryForm<K extends keyof HistoryEditForm>(key: K, value: HistoryEditForm[K]) {
    setHistoryForm((current) => ({ ...current, [key]: value }));
  }

  function toggleActiveScreenshot(fileName: string, checked: boolean) {
    setSelectedActiveScreenshots((current) => toggleSelection(current, fileName, checked));
  }

  function toggleTrashedScreenshot(fileName: string, checked: boolean) {
    setSelectedTrashedScreenshots((current) => toggleSelection(current, fileName, checked));
  }

  function openLightbox(scope: ScreenshotScope, screenshot: HistoryScreenshot) {
    if (!historyDetail) return;

    const screenshots = screenshotsForScope(historyDetail, scope);
    const index = screenshots.findIndex((item) => item.fileName === screenshot.fileName);
    if (index < 0) return;

    setLightbox({ scope, index });
  }

  function navigateLightbox(direction: LightboxDirection) {
    setLightbox((current) => {
      if (!current || !historyDetail) return current;

      const screenshots = screenshotsForScope(historyDetail, current.scope);
      const nextIndex = getAdjacentLightboxIndex(current.index, screenshots.length, direction);
      return nextIndex === null ? null : { ...current, index: nextIndex };
    });
  }

  async function trashLightboxScreenshot() {
    if (!historyDetail || !lightbox || lightbox.scope !== 'active' || lightboxDeleteInFlightRef.current) return;

    const screenshot = getLightboxScreenshot(historyDetail, lightbox);
    if (!screenshot) return;

    const nextIndex = chooseNextLightboxIndex(lightbox.index, historyDetail.screenshots.length);
    lightboxDeleteInFlightRef.current = true;
    setHistoryAction('trash');
    setHistoryError('');

    try {
      const nextDetail = await api.trashHistoryScreenshots(historyDetail.entry.id, [screenshot.fileName]);
      setLastLightboxTrash({ entryId: historyDetail.entry.id, fileName: screenshot.fileName });
      applyHistoryDetail(nextDetail);
      const nextScreenshots = screenshotsForScope(nextDetail, 'active');
      setLightbox(nextIndex === null || !nextScreenshots[nextIndex] ? null : { scope: 'active', index: nextIndex });
      await loadHistory();
    } catch (caught) {
      setHistoryError(errorMessage(caught, 'Не удалось перенести скриншот в корзину.'));
    } finally {
      lightboxDeleteInFlightRef.current = false;
      setHistoryAction('');
    }
  }

  async function restoreLastLightboxScreenshot() {
    if (
      !historyDetail ||
      !lastLightboxTrash ||
      lastLightboxTrash.entryId !== historyDetail.entry.id ||
      historyAction === 'restore'
    ) {
      return;
    }

    setHistoryAction('restore');
    setHistoryError('');

    try {
      const nextDetail = await api.restoreHistoryScreenshots(historyDetail.entry.id, [lastLightboxTrash.fileName]);
      applyHistoryDetail(nextDetail);
      const restoredIndex = getRestoredLightboxIndex(nextDetail.screenshots, lastLightboxTrash.fileName);
      setLastLightboxTrash(null);
      setLightbox(restoredIndex === null ? null : { scope: 'active', index: restoredIndex });
      await loadHistory();
    } catch (caught) {
      setHistoryError(errorMessage(caught, 'Не удалось вернуть последний скриншот.'));
    } finally {
      setHistoryAction('');
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

  async function handleCompressVideo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!compressionFile) return;

    compressionEventSourceRef.current?.close();
    compressionStartedAtRef.current = Date.now();
    setCompressionStatus('running');
    setCompressionError('');
    setCompressionResult(null);
    setCompressionElapsedSeconds(0);
    setCompressionStages(createStages(COMPRESSION_STAGES));

    try {
      const response = await api.compressVideo(compressionFile, compressionPreset);
      subscribeToCompressionJob(response.jobId);
    } catch (caught) {
      finishCompressionRun('error');
      setCompressionError(errorMessage(caught, 'Не удалось запустить сжатие видео.'));
    }
  }

  function subscribeToCompressionJob(jobId: string) {
    const eventSource = new EventSource(api.jobEventsUrl(jobId));
    compressionEventSourceRef.current = eventSource;

    eventSource.onmessage = (message) => {
      const event = parseProgressEvent(message.data);
      if (!event) return;

      if (event.type === 'progress') {
        updateCompressionStage(event.stage, event.progress, event.progress >= 100 ? 'done' : 'running');
      }

      if (event.type === 'done') {
        completeCompressionStages();
        setCompressionResult(toCompressionResult(event.result, compressionPreset));
        finishCompressionRun('done');
        compressionEventSourceRef.current = null;
        eventSource.close();
      }

      if (event.type === 'error') {
        finishCompressionRun('error');
        setCompressionError(event.error || 'Не удалось сжать видео.');
        compressionEventSourceRef.current = null;
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      if (compressionEventSourceRef.current === eventSource) {
        finishCompressionRun('error');
        setCompressionError('Потеряно соединение с потоком прогресса сжатия.');
        compressionEventSourceRef.current = null;
      }
      eventSource.close();
    };
  }

  function updateCompressionStage(stageId: string, progress: number, nextStatus: StageStatus) {
    const now = Date.now();

    setCompressionStages((currentStages) =>
      currentStages.map((stage) => {
        if (stage.id !== stageId) return stage;

        const startedAt = stage.startedAt || now;
        const isDone = nextStatus === 'done' || progress >= 100;
        const finishedAt = isDone ? stage.finishedAt || now : null;

        return {
          ...stage,
          status: isDone ? 'done' : nextStatus,
          progress: Math.max(stage.progress, Math.min(100, progress)),
          indeterminate: false,
          startedAt,
          finishedAt,
          elapsedSeconds: Math.floor(((finishedAt || now) - startedAt) / 1000)
        };
      })
    );
  }

  function completeCompressionStages() {
    const now = Date.now();
    setCompressionStages((currentStages) =>
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

  function finishCompressionRun(nextStatus: Exclude<RunStatus, 'idle' | 'running'>) {
    setCompressionStatus(nextStatus);
    setCompressionElapsedSeconds(Math.floor((Date.now() - compressionStartedAtRef.current) / 1000));
  }

  const disabled = status === 'running' || (sourceMode === 'url' ? !url.trim() : !file);
  const showProgress = stages.length > 0 && status !== 'idle';
  const videoBusy = videoStatus === 'loading' || videoStatus === 'downloading';
  const canLoadVideoFormats = Boolean(videoUrl.trim()) && !videoBusy;
  const canDownloadVideo = Boolean(videoUrl.trim() && selectedVideoFormatId) && !videoBusy;
  const compressionBusy = compressionStatus === 'running';
  const canCompressVideo = Boolean(compressionFile) && !compressionBusy;
  const headerStatus = view === 'compress'
    ? compressionStatus
    : view === 'download'
      ? normalizeVideoStatus(videoStatus)
      : view === 'history'
        ? 'idle'
        : status;
  const lightboxScreenshot = historyDetail && lightbox ? getLightboxScreenshot(historyDetail, lightbox) : null;
  const lightboxTotalItems = historyDetail && lightbox ? screenshotsForScope(historyDetail, lightbox.scope).length : 0;
  const canUndoLightboxTrash = Boolean(
    historyDetail &&
    lastLightboxTrash &&
    lastLightboxTrash.entryId === historyDetail.entry.id
  );

  return (
    <main className="min-h-screen px-4 py-8 text-neutral-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6">
        <header className="flex flex-col gap-2 border-b border-neutral-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Transcribator</h1>
            <p className="mt-1 text-sm text-neutral-600">API: {API_BASE_URL}</p>
          </div>
          <Badge variant={headerStatus === 'running' ? 'secondary' : headerStatus === 'error' ? 'error' : 'success'}>
            {statusLabel(headerStatus)}
          </Badge>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="Разделы CRM">
          {crmNavigationItems.map((item) => (
            <Link
              href={item.href}
              key={item.id}
              aria-current={item.id === view ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center rounded-md border px-4 py-2 text-sm font-medium transition',
                item.id === view
                  ? 'border-neutral-950 bg-neutral-950 text-white'
                  : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {view === 'transcribe' && (
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

                <section className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={screenshotsEnabled}
                      onChange={(event) => setScreenshotsEnabled(event.target.checked)}
                      disabled={status === 'running'}
                      className="h-4 w-4"
                    />
                    <Images className="h-4 w-4" />
                    Создавать скриншоты
                  </label>

                  <label className="grid gap-2 text-sm font-medium">
                    Интервал скриншотов, сек
                    <Input
                      type="number"
                      min={1}
                      max={3600}
                      step={1}
                      value={screenshotIntervalSeconds}
                      onChange={(event) => setScreenshotIntervalSeconds(normalizeScreenshotIntervalInput(event.target.value))}
                      disabled={status === 'running' || !screenshotsEnabled}
                    />
                  </label>
                </section>

                <Button type="submit" disabled={disabled} className="w-fit">
                  <Play className="h-4 w-4" />
                  {status === 'running' ? 'Transcribing...' : 'Transcribe'}
                </Button>
              </form>

              {showProgress && <ProgressPanel stages={stages} status={status} elapsedSeconds={elapsedSeconds} />}

              {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p>}
              {markdownPath && (
                <section className="grid gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                  <p className="break-words">Markdown: {markdownPath}</p>
                  <p>Скриншотов создано: {screenshotsCount}</p>
                </section>
              )}
              {!markdownPath && screenshotsCount > 0 && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                  Скриншотов создано: {screenshotsCount}. Markdown можно создать в деталке истории.
                </p>
              )}

              <section className="grid gap-4">
                <label className="grid gap-2 text-sm font-medium">
                  Summary
                  <Textarea className="min-h-36" value={summary} readOnly placeholder="Summary появится после нейроформатирования." />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Formatted transcript
                  <Textarea className="min-h-72" value={formattedText} readOnly placeholder="Нейроформатирование появится здесь." />
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

            </section>
        )}

        {view === 'history' && (
            <section className="grid gap-5">
              {historyDetail ? (
                <HistoryDetailView
                  detail={historyDetail}
                  form={historyForm}
                  onBack={closeHistoryDetail}
                  onSave={() => void saveHistoryDetail()}
                  onFormat={() => void formatHistoryDetail()}
                  onCreateMarkdown={() => void createHistoryMarkdown()}
                  onFormChange={updateHistoryForm}
                  saving={historySaving}
                  action={historyAction}
                  selectedActive={selectedActiveScreenshots}
                  selectedTrash={selectedTrashedScreenshots}
                  onToggleActive={toggleActiveScreenshot}
                  onToggleTrash={toggleTrashedScreenshot}
                  onTrashSelected={() => void trashSelectedScreenshots()}
                  onRestoreSelected={() => void restoreSelectedScreenshots()}
                  onClearTrash={() => void clearScreenshotsTrash()}
                  onOpenLightbox={openLightbox}
                />
              ) : (
                <HistoryList
                  history={history}
                  loading={historyLoading}
                  onRefresh={() => void loadHistory({ showLoading: true, showError: true })}
                  onOpen={(id) => router.push(buildHistoryDetailPath(id))}
                />
              )}

              {historyError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                  {historyError}
                </p>
              )}
            </section>
        )}

        {view === 'download' && (
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
        )}

        {view === 'compress' && (
            <section className="grid gap-5">
              <form onSubmit={handleCompressVideo} className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <label className="grid gap-2 text-sm font-medium">
                  Видео файл
                  <Input
                    type="file"
                    accept="video/*"
                    onChange={(event) => setCompressionFile(event.target.files?.[0] || null)}
                    disabled={compressionBusy}
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Пресет качества
                  <Select
                    value={compressionPreset}
                    onValueChange={(value) => setCompressionPreset(value as VideoCompressionPreset)}
                    disabled={compressionBusy}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPRESSION_PRESETS.map((option) => (
                        <SelectItem value={option.value} key={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <Button type="submit" disabled={!canCompressVideo} className="w-fit">
                  <FileVideo className="h-4 w-4" />
                  {compressionBusy ? 'Сжимаю...' : 'Сжать'}
                </Button>
              </form>

              {compressionStages.length > 0 && compressionStatus !== 'idle' && (
                <ProgressPanel stages={compressionStages} status={compressionStatus} elapsedSeconds={compressionElapsedSeconds} />
              )}

              {compressionError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{compressionError}</p>
              )}

              {compressionResult && (
                <section className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-semibold break-words">Сжатое видео сохранено: {compressionResult.outputPath}</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Metric label="До" value={formatFileSize(compressionResult.originalSizeBytes)} />
                    <Metric label="После" value={formatFileSize(compressionResult.compressedSizeBytes)} />
                    <Metric label="Экономия" value={formatSavings(compressionResult)} />
                  </div>
                </section>
              )}
            </section>
        )}

        {lightbox && lightboxScreenshot && (
          <ScreenshotLightbox
            lightbox={lightbox}
            screenshot={lightboxScreenshot}
            totalItems={lightboxTotalItems}
            deleting={historyAction === 'trash'}
            restoring={historyAction === 'restore'}
            onClose={() => setLightbox(null)}
            onPrevious={() => navigateLightbox('previous')}
            onNext={() => navigateLightbox('next')}
            onDelete={lightbox.scope === 'active' ? () => void trashLightboxScreenshot() : undefined}
            onUndo={lightbox.scope === 'active' && canUndoLightboxTrash ? () => void restoreLastLightboxScreenshot() : undefined}
          />
        )}
      </div>
    </main>
  );
}

function ProgressPanel({ stages, status, elapsedSeconds }: { stages: StageState[]; status: RunStatus; elapsedSeconds: number }) {
  const currentStage = stages.find((stage) => stage.status === 'running') || stages.find((stage) => stage.status === 'pending') || stages.at(-1);
  const remainingSeconds = currentStage ? estimateRemainingSeconds(currentStage) : null;

  return (
    <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium">
        <span>{status === 'running' ? 'В работе' : status === 'done' ? 'Готово' : 'Остановлено'}</span>
        <span>
          Всего: {formatElapsed(elapsedSeconds)}
          {remainingSeconds !== null ? ` · Осталось примерно ${formatElapsed(remainingSeconds)}` : ''}
        </span>
      </div>
      {currentStage && (
        <p className="text-sm text-neutral-600">
          Текущая стадия: {currentStage.label}
        </p>
      )}
      <div className="grid gap-4">
        {stages.map((stage) => (
          <div className="grid gap-2" key={stage.id}>
            <div className="flex items-center justify-between gap-3 text-sm font-medium">
              <span>{stage.label}</span>
              <span>
                {Math.round(stage.progress)}% · {formatElapsed(stage.elapsedSeconds)}
                {stage.status === 'running' && estimateRemainingSeconds(stage) !== null
                  ? ` · осталось ~${formatElapsed(estimateRemainingSeconds(stage) as number)}`
                  : ''}
              </span>
            </div>
            <Progress value={stage.progress} aria-label={stage.label} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-emerald-200 bg-white/60 p-3">
      <span className="text-xs font-medium uppercase text-emerald-700">{label}</span>
      <strong className="text-base text-emerald-950">{value}</strong>
    </div>
  );
}

function HistoryList({
  history,
  loading,
  onRefresh,
  onOpen
}: {
  history: HistoryEntry[];
  loading: boolean;
  onRefresh: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">История</h2>
          <p className="mt-1 text-sm text-neutral-600">Сохраненные транскрибации и Obsidian-артефакты.</p>
        </div>
        <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Обновить
        </Button>
      </div>

      {loading && history.length === 0 ? (
        <p className="text-sm text-neutral-600">Загружаю историю...</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-neutral-600">Завершенных транскрибаций пока нет.</p>
      ) : (
        <div className="grid gap-3">
          {history.map((item) => (
            <HistoryItem item={item} key={item.id} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryItem({ item, onOpen }: { item: HistoryEntry; onOpen: (id: string) => void }) {
  const title = item.title || item.source || item.sourceType || item.id;
  const preview = item.summary || item.formattedText || item.cleanText;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(item.id);
        }
      }}
      className="cursor-pointer transition hover:border-neutral-300 hover:bg-neutral-50"
    >
      <CardHeader className="grid gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="break-words">{title}</CardTitle>
          <p className="mt-1 break-words text-sm text-neutral-600">{item.source || item.sourceType}</p>
          <p className="mt-1 text-xs text-neutral-500">{engineLabel(item.engine)} · {formatHistoryDate(item.finishedAt)}</p>
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

        {item.markdownPath && (
          <div className="grid gap-1 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="break-words font-medium">Markdown: {item.markdownPath}</p>
            <p>Скриншотов: {item.screenshotsCount}</p>
          </div>
        )}

        {preview && (
          <p className="text-sm text-neutral-700">{previewText(preview)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryDetailView({
  detail,
  form,
  onBack,
  onSave,
  onFormat,
  onCreateMarkdown,
  onFormChange,
  saving,
  action,
  selectedActive,
  selectedTrash,
  onToggleActive,
  onToggleTrash,
  onTrashSelected,
  onRestoreSelected,
  onClearTrash,
  onOpenLightbox
}: {
  detail: HistoryDetailResponse;
  form: HistoryEditForm;
  onBack: () => void;
  onSave: () => void;
  onFormat: () => void;
  onCreateMarkdown: () => void;
  onFormChange: <K extends keyof HistoryEditForm>(key: K, value: HistoryEditForm[K]) => void;
  saving: boolean;
  action: HistoryAction;
  selectedActive: string[];
  selectedTrash: string[];
  onToggleActive: (fileName: string, checked: boolean) => void;
  onToggleTrash: (fileName: string, checked: boolean) => void;
  onTrashSelected: () => void;
  onRestoreSelected: () => void;
  onClearTrash: () => void;
  onOpenLightbox: (scope: ScreenshotScope, screenshot: HistoryScreenshot) => void;
}) {
  const entry = detail.entry;
  const systemFields: Array<[string, string | number | undefined]> = [
    ['id', entry.id],
    ['status', entry.status],
    ['startedAt', formatHistoryDate(entry.startedAt)],
    ['finishedAt', formatHistoryDate(entry.finishedAt)],
    ['elapsedSeconds', `${entry.elapsedSeconds} сек`],
    ['outputPath', entry.outputPath],
    ['markdownPath', entry.markdownPath],
    ['obsidianFolderPath', entry.obsidianFolderPath]
  ];

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onFormat} disabled={action === 'format'}>
            <Sparkles className={cn('h-4 w-4', action === 'format' && 'animate-pulse')} />
            {action === 'format' ? 'Форматирую...' : 'Нейроформатирование'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCreateMarkdown} disabled={action === 'markdown'}>
            <FileText className="h-4 w-4" />
            {action === 'markdown' ? 'Создаю...' : 'Создать Markdown'}
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Сохраняю...' : 'Сохранить правки'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="grid gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="break-words">{form.title || form.source || entry.id}</CardTitle>
            <p className="mt-1 break-words text-sm text-neutral-600">{form.source || 'Источник не указан'}</p>
          </div>
          <Badge variant={entry.status === 'done' ? 'success' : 'error'}>{entry.status}</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {systemFields.map(([label, value]) => (
            <ReadonlyField label={label} value={value} key={label} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Содержимое</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Title
              <Input value={form.title} onChange={(event) => onFormChange('title', event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Source
              <Input value={form.source} onChange={(event) => onFormChange('source', event.target.value)} />
            </label>
          </div>
          <label className="grid gap-2 text-sm font-medium">
            Engine
            <Input value={form.engine} onChange={(event) => onFormChange('engine', event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Summary
            <Textarea className="min-h-36" value={form.summary} onChange={(event) => onFormChange('summary', event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Formatted transcript
            <Textarea
              className="min-h-80"
              value={form.formattedText}
              onChange={(event) => onFormChange('formattedText', event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Clean transcript
            <Textarea className="min-h-80" value={form.cleanText} onChange={(event) => onFormChange('cleanText', event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Raw transcript
            <Textarea className="min-h-80" value={form.rawText} onChange={(event) => onFormChange('rawText', event.target.value)} />
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader className="grid gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Галерея</CardTitle>
              <p className="mt-1 text-sm text-neutral-600">Активные скриншоты попадают в `transcript.md`.</p>
            </div>
            <Button type="button" variant="secondary" onClick={onTrashSelected} disabled={selectedActive.length === 0 || action === 'trash'}>
              <Trash2 className="h-4 w-4" />
              {action === 'trash' ? 'Переношу...' : `В корзину (${selectedActive.length})`}
            </Button>
          </CardHeader>
          <CardContent>
            <ScreenshotGrid
              screenshots={detail.screenshots}
              scope="active"
              selected={selectedActive}
              emptyText="Активных скриншотов нет."
              onToggle={onToggleActive}
              onOpen={onOpenLightbox}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="grid gap-3">
            <div>
              <CardTitle>Корзина</CardTitle>
              <p className="mt-1 text-sm text-neutral-600">Файлы здесь уже исключены из Markdown.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onRestoreSelected}
                disabled={selectedTrash.length === 0 || action === 'restore'}
              >
                <RotateCcw className="h-4 w-4" />
                {action === 'restore' ? 'Восстанавливаю...' : `Вернуть (${selectedTrash.length})`}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onClearTrash}
                disabled={detail.trashedScreenshots.length === 0 || action === 'clear'}
              >
                <Trash2 className="h-4 w-4" />
                {action === 'clear' ? 'Удаляю...' : 'Очистить'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScreenshotGrid
              screenshots={detail.trashedScreenshots}
              scope="trash"
              selected={selectedTrash}
              emptyText="Корзина пуста."
              onToggle={onToggleTrash}
              onOpen={onOpenLightbox}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ScreenshotGrid({
  screenshots,
  scope,
  selected,
  emptyText,
  onToggle,
  onOpen
}: {
  screenshots: HistoryScreenshot[];
  scope: ScreenshotScope;
  selected: string[];
  emptyText: string;
  onToggle: (fileName: string, checked: boolean) => void;
  onOpen: (scope: ScreenshotScope, screenshot: HistoryScreenshot) => void;
}) {
  if (screenshots.length === 0) {
    return <p className="text-sm text-neutral-600">{emptyText}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {screenshots.map((screenshot) => {
        const checked = selected.includes(screenshot.fileName);
        const imageUrl = apiAssetUrl(screenshot.url);

        return (
          <div className="grid gap-2" key={screenshot.fileName}>
            <div className="relative aspect-video overflow-hidden rounded-md border border-neutral-200 bg-neutral-100">
              <label className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-white/90 shadow-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => onToggle(screenshot.fileName, event.target.checked)}
                  aria-label={`Выбрать ${screenshot.fileName}`}
                  className="h-4 w-4"
                />
              </label>
              {screenshot.exists && imageUrl ? (
                <button
                  type="button"
                  className="h-full w-full"
                  onClick={() => onOpen(scope, screenshot)}
                  aria-label={`Открыть ${screenshot.fileName}`}
                >
                  <img src={imageUrl} alt={screenshot.fileName} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center text-xs text-neutral-600">
                  <ImageOff className="h-5 w-5" />
                  Файл отсутствует
                </div>
              )}
            </div>
            <div className="grid gap-0.5 text-xs text-neutral-600">
              <span className="truncate font-medium text-neutral-800">{screenshot.fileName}</span>
              <span>{formatElapsed(Math.floor(screenshot.timestampSeconds))}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScreenshotLightbox({
  lightbox,
  screenshot,
  totalItems,
  deleting,
  restoring,
  onClose,
  onPrevious,
  onNext,
  onDelete,
  onUndo
}: {
  lightbox: LightboxState;
  screenshot: HistoryScreenshot;
  totalItems: number;
  deleting: boolean;
  restoring: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onDelete?: (() => void) | undefined;
  onUndo?: (() => void) | undefined;
}) {
  const imageUrl = apiAssetUrl(screenshot.url);

  if (!imageUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true">
      <div className="absolute left-4 top-4 flex gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white text-neutral-950 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Перенести в корзину"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={restoring}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white text-neutral-950 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Вернуть последний скриншот"
            title="Вернуть последний скриншот (Cmd+Z)"
          >
            <Undo2 className="h-5 w-5" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-white text-neutral-950 shadow-sm"
        aria-label="Закрыть"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onPrevious}
        className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md bg-white text-neutral-950 shadow-sm"
        aria-label="Предыдущий скриншот"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={onNext}
        className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md bg-white text-neutral-950 shadow-sm"
        aria-label="Следующий скриншот"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
      <figure className="grid max-h-full max-w-6xl gap-3">
        <img src={imageUrl} alt={screenshot.fileName} className="max-h-[82vh] max-w-full rounded-md object-contain" />
        <figcaption className="text-center text-sm text-white">
          {screenshot.fileName} · {lightbox.scope === 'trash' ? 'корзина' : 'галерея'} · {lightbox.index + 1}/{totalItems}
        </figcaption>
      </figure>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="grid gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <span className="text-xs font-medium uppercase text-neutral-500">{label}</span>
      <span className="break-words text-sm text-neutral-900">{String(value || 'Нет данных')}</span>
    </div>
  );
}

function screenshotsForScope(detail: HistoryDetailResponse, scope: ScreenshotScope): HistoryScreenshot[] {
  return scope === 'active' ? detail.screenshots : detail.trashedScreenshots;
}

function getLightboxScreenshot(detail: HistoryDetailResponse, lightbox: LightboxState): HistoryScreenshot | null {
  return screenshotsForScope(detail, lightbox.scope)[lightbox.index] || null;
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

function createHistoryEditForm(entry?: HistoryEntry): HistoryEditForm {
  return {
    title: entry?.title || '',
    source: entry?.source || '',
    engine: entry?.engine || '',
    summary: entry?.summary || '',
    formattedText: entry?.formattedText || '',
    cleanText: entry?.cleanText || '',
    rawText: entry?.rawText || ''
  };
}

function toggleSelection(current: string[], value: string, checked: boolean): string[] {
  if (checked) {
    return current.includes(value) ? current : [...current, value];
  }

  return current.filter((item) => item !== value);
}

function apiAssetUrl(value: string): string {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_BASE_URL}${value.startsWith('/') ? value : `/${value}`}`;
}

function buildTranscriptionStages(isFileMode: boolean, includeObsidian: boolean): Array<{ id: string; label: string }> {
  const baseStages = isFileMode ? FILE_STAGES : URL_STAGES;
  return includeObsidian ? [...baseStages, { id: 'screenshots', label: 'Создать скриншоты' }] : baseStages;
}

function parseProgressEvent(data: string): ProgressEvent | null {
  try {
    const parsed = progressEventSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function toCompressionResult(result: unknown, preset: VideoCompressionPreset): VideoCompressionResult {
  const payload = result && typeof result === 'object' ? result as Partial<VideoCompressionResult> : {};
  const payloadPreset = payload.preset;

  return {
    outputPath: String(payload.outputPath || ''),
    originalSizeBytes: Number(payload.originalSizeBytes) || 0,
    compressedSizeBytes: Number(payload.compressedSizeBytes) || 0,
    savedBytes: Number(payload.savedBytes) || 0,
    savingsRatio: Number(payload.savingsRatio) || 0,
    durationSeconds: Number(payload.durationSeconds) || 0,
    preset: payloadPreset === 'high' || payloadPreset === 'balanced' || payloadPreset === 'small'
      ? payloadPreset
      : preset
  };
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatHistoryDate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 'Нет данных';
  return new Date(value).toLocaleString('ru-RU');
}

function previewText(value: string, maxLength = 220) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function estimateRemainingSeconds(stage: StageState): number | null {
  if (stage.status !== 'running' || stage.progress <= 0 || stage.progress >= 100 || stage.elapsedSeconds <= 0) {
    return null;
  }

  return Math.max(0, Math.ceil((stage.elapsedSeconds / stage.progress) * (100 - stage.progress)));
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatSavings(result: VideoCompressionResult) {
  const savedBytes = result.savedBytes;
  const percent = Math.round((result.savingsRatio || 0) * 100);

  if (savedBytes <= 0) {
    return '0 B (сжатый файл не меньше исходного)';
  }

  return `${formatFileSize(savedBytes)} (${percent}%)`;
}

function normalizeVideoStatus(status: RunStatus | 'loading' | 'downloading'): RunStatus {
  if (status === 'loading' || status === 'downloading') return 'running';
  return status;
}

function normalizeScreenshotIntervalInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(3600, Math.floor(parsed)));
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
