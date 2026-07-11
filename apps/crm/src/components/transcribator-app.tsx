'use client';

import Link from 'next/link';
import * as React from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
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
  type ProgressEvent,
  type TranscriptionEngine,
  type VideoCompressionPreset,
  type VideoCompressionResult,
  type VideoFormat,
  type VideoScreenshot,
  type YouTubeVideo
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
import {
  buildVideoDetailPath,
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
} from './screenshot-lightbox-navigation';
import { buildCleanTranscriptClipboardText } from './transcript-clipboard';
import {
  ALL_YOUTUBE_CHANNELS_ID,
  buildYouTubeChannelFilters,
  filterYouTubeVideosByChannel
} from './youtube-video-channels';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:2001';

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
type VideoAction = '' | 'transcribe' | 'trash' | 'restore' | 'clear' | 'format' | 'markdown' | 'save' | 'thumbnail';
type CopyStatus = 'idle' | 'copied';

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

interface VideoTranscriptForm {
  title: string;
  description: string;
  channelTitle: string;
  summary: string;
  formattedText: string;
  cleanText: string;
  rawText: string;
}

type VideoTranscriptFormChange = <K extends keyof VideoTranscriptForm>(key: K, value: VideoTranscriptForm[K]) => void;

interface LightboxState {
  scope: ScreenshotScope;
  index: number;
}

interface LastLightboxTrash {
  videoId: string;
  fileName: string;
}

interface TranscribatorAppProps {
  view?: AppView;
  videoId?: string;
}

export function TranscribatorApp({ view = 'transcribe', videoId }: TranscribatorAppProps) {
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
  const [cleanTranscriptCopyStatus, setCleanTranscriptCopyStatus] = React.useState<CopyStatus>('idle');
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
  const [youtubeVideos, setYoutubeVideos] = React.useState<YouTubeVideo[]>([]);
  const [youtubeVideosLoading, setYoutubeVideosLoading] = React.useState(false);
  const [youtubeVideosError, setYoutubeVideosError] = React.useState('');
  const [selectedYoutubeChannelId, setSelectedYoutubeChannelId] = React.useState(ALL_YOUTUBE_CHANNELS_ID);
  const [youtubeVideoDetail, setYoutubeVideoDetail] = React.useState<YouTubeVideo | null>(null);
  const [youtubeVideoDetailLoading, setYoutubeVideoDetailLoading] = React.useState(false);
  const [youtubeVideoDetailRefreshing, setYoutubeVideoDetailRefreshing] = React.useState(false);
  const [youtubeVideoDetailError, setYoutubeVideoDetailError] = React.useState('');
  const [youtubeVideoMetadataError, setYoutubeVideoMetadataError] = React.useState('');
  const [youtubeVideoThumbnailError, setYoutubeVideoThumbnailError] = React.useState('');
  const [youtubeVideoAction, setYoutubeVideoAction] = React.useState<VideoAction>('');
  const [youtubeVideoTranscriptForm, setYoutubeVideoTranscriptForm] = React.useState<VideoTranscriptForm>(createVideoTranscriptForm());
  const [youtubeVideoTranscriptionStages, setYoutubeVideoTranscriptionStages] = React.useState<StageState[]>([]);
  const [youtubeVideoTranscriptionStatus, setYoutubeVideoTranscriptionStatus] = React.useState<RunStatus>('idle');
  const [youtubeVideoTranscriptionElapsedSeconds, setYoutubeVideoTranscriptionElapsedSeconds] = React.useState(0);
  const [youtubeVideoScreenshotsEnabled, setYoutubeVideoScreenshotsEnabled] = React.useState(true);
  const [youtubeVideoScreenshotIntervalSeconds, setYoutubeVideoScreenshotIntervalSeconds] = React.useState(30);
  const [compressionFile, setCompressionFile] = React.useState<File | null>(null);
  const [compressionPreset, setCompressionPreset] = React.useState<VideoCompressionPreset>('balanced');
  const [compressionStatus, setCompressionStatus] = React.useState<RunStatus>('idle');
  const [compressionError, setCompressionError] = React.useState('');
  const [compressionStages, setCompressionStages] = React.useState<StageState[]>([]);
  const [compressionElapsedSeconds, setCompressionElapsedSeconds] = React.useState(0);
  const [compressionResult, setCompressionResult] = React.useState<VideoCompressionResult | null>(null);
  const startedAtRef = React.useRef<number>(Date.now());
  const youtubeVideoTranscriptionStartedAtRef = React.useRef<number>(Date.now());
  const compressionStartedAtRef = React.useRef<number>(Date.now());
  const eventSourceRef = React.useRef<EventSource | null>(null);
  const youtubeVideoEventSourceRef = React.useRef<EventSource | null>(null);
  const compressionEventSourceRef = React.useRef<EventSource | null>(null);
  const lightboxDeleteInFlightRef = React.useRef(false);
  const cleanTranscriptCopyTimerRef = React.useRef<number | null>(null);
  const youtubeChannelFilters = React.useMemo(() => buildYouTubeChannelFilters(youtubeVideos), [youtubeVideos]);
  const filteredYoutubeVideos = React.useMemo(
    () => filterYouTubeVideosByChannel(youtubeVideos, selectedYoutubeChannelId),
    [youtubeVideos, selectedYoutubeChannelId]
  );

  React.useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      youtubeVideoEventSourceRef.current?.close();
      compressionEventSourceRef.current?.close();
      if (cleanTranscriptCopyTimerRef.current !== null) {
        window.clearTimeout(cleanTranscriptCopyTimerRef.current);
      }
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
    if (view === 'videos') {
      void loadYouTubeVideos({ showLoading: true, showError: true });
    }
  }, [view]);

  React.useEffect(() => {
    if (!youtubeChannelFilters.some((filter) => filter.id === selectedYoutubeChannelId)) {
      setSelectedYoutubeChannelId(ALL_YOUTUBE_CHANNELS_ID);
    }
  }, [youtubeChannelFilters, selectedYoutubeChannelId]);

  React.useEffect(() => {
    if (view === 'videoDetail' && videoId) {
      void loadYouTubeVideoDetail(videoId, { showLoading: true, showError: true });
    }
  }, [view, videoId]);

  React.useEffect(() => {
    if (youtubeVideoTranscriptionStatus !== 'running') return undefined;

    const timer = window.setInterval(() => {
      const now = Date.now();
      setYoutubeVideoTranscriptionElapsedSeconds(Math.floor((now - youtubeVideoTranscriptionStartedAtRef.current) / 1000));
      setYoutubeVideoTranscriptionStages((currentStages) =>
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
  }, [youtubeVideoTranscriptionStatus]);

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
  }, [youtubeVideoDetail, youtubeVideoAction, lastLightboxTrash, lightbox]);

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

  async function loadYouTubeVideos(options: { showLoading?: boolean; showError?: boolean } = {}) {
    if (options.showLoading) {
      setYoutubeVideosLoading(true);
    }
    if (options.showError) {
      setYoutubeVideosError('');
    }

    try {
      const response = await api.getYouTubeVideos();
      setYoutubeVideos(response.videos || []);
    } catch (caught) {
      setYoutubeVideos([]);
      if (options.showError) {
        setYoutubeVideosError(errorMessage(caught, 'Не удалось загрузить видео.'));
      }
    } finally {
      if (options.showLoading) {
        setYoutubeVideosLoading(false);
      }
    }
  }

  async function loadYouTubeVideoDetail(id: string, options: { showLoading?: boolean; showError?: boolean } = {}) {
    if (options.showLoading) {
      setYoutubeVideoDetailLoading(true);
    }
    if (options.showError) {
      setYoutubeVideoDetailError('');
      setYoutubeVideoMetadataError('');
      setYoutubeVideoThumbnailError('');
    }

    try {
      const response = await api.getYouTubeVideo(id);
      setYoutubeVideoDetail(response.video);
      setYoutubeVideoTranscriptForm(createVideoTranscriptForm(response.video));
      setSelectedActiveScreenshots([]);
      setSelectedTrashedScreenshots([]);
      setLightbox(null);
      setLastLightboxTrash(null);
      setYoutubeVideoMetadataError(response.metadataError || '');
      setYoutubeVideoThumbnailError('');
    } catch (caught) {
      setYoutubeVideoDetail(null);
      if (options.showError) {
        setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось загрузить видео.'));
      }
    } finally {
      if (options.showLoading) {
        setYoutubeVideoDetailLoading(false);
      }
    }
  }

  async function refreshYouTubeVideoMetadata(id: string) {
    setYoutubeVideoDetailRefreshing(true);
    setYoutubeVideoDetailError('');
    setYoutubeVideoMetadataError('');
    setYoutubeVideoThumbnailError('');

    try {
      const response = await api.refreshYouTubeVideoMetadata(id);
      setYoutubeVideoDetail(response.video);
      setYoutubeVideoTranscriptForm(createVideoTranscriptForm(response.video));
      setYoutubeVideoMetadataError(response.metadataError || '');
    } catch (caught) {
      setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось обновить метаданные.'));
    } finally {
      setYoutubeVideoDetailRefreshing(false);
    }
  }

  function applyYouTubeVideo(video: YouTubeVideo) {
    setYoutubeVideoDetail(video);
    setYoutubeVideoTranscriptForm(createVideoTranscriptForm(video));
    setSelectedActiveScreenshots([]);
    setSelectedTrashedScreenshots([]);
    setLightbox(null);
    setYoutubeVideoThumbnailError('');
  }

  async function saveYouTubeVideoTranscript() {
    if (!youtubeVideoDetail) return;

    setYoutubeVideoAction('save');
    setYoutubeVideoDetailError('');

    try {
      const response = await api.updateYouTubeVideoTranscript(youtubeVideoDetail.id, youtubeVideoTranscriptForm);
      applyYouTubeVideo(response.video);
      await refreshVideoListAfterDetailChange(response.video);
    } catch (caught) {
      setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось сохранить транскрипт.'));
    } finally {
      setYoutubeVideoAction('');
    }
  }

  async function uploadYouTubeVideoThumbnail(file: File) {
    if (!youtubeVideoDetail) return;

    setYoutubeVideoAction('thumbnail');
    setYoutubeVideoDetailError('');
    setYoutubeVideoThumbnailError('');

    try {
      const response = await api.uploadYouTubeVideoThumbnail(youtubeVideoDetail.id, file);
      applyYouTubeVideo(response.video);
      await refreshVideoListAfterDetailChange(response.video);
    } catch (caught) {
      setYoutubeVideoThumbnailError(errorMessage(caught, 'Не удалось загрузить превью.'));
    } finally {
      setYoutubeVideoAction('');
    }
  }

  async function startYouTubeVideoTranscription(video: YouTubeVideo) {
    youtubeVideoEventSourceRef.current?.close();
    youtubeVideoTranscriptionStartedAtRef.current = Date.now();
    setYoutubeVideoTranscriptionStatus('running');
    setYoutubeVideoTranscriptionElapsedSeconds(0);
    setYoutubeVideoTranscriptionStages(createStages(buildTranscriptionStages(false, youtubeVideoScreenshotsEnabled)));
    setYoutubeVideoAction('transcribe');
    setYoutubeVideoDetailError('');

    try {
      const response = await api.transcribeYouTubeVideo(video.id, {
        engine,
        screenshotsEnabled: youtubeVideoScreenshotsEnabled,
        screenshotIntervalSeconds: youtubeVideoScreenshotIntervalSeconds
      });
      applyYouTubeVideo(response.video);
      setYoutubeVideos((current) => current.map((item) => item.id === response.video.id ? response.video : item));
      subscribeToYouTubeVideoJob(response.jobId, response.video.id);
    } catch (caught) {
      finishYouTubeVideoTranscriptionRun('error');
      setYoutubeVideoAction('');
      setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось запустить транскрибацию видео.'));
    }
  }

  async function formatYouTubeVideoTranscript() {
    if (!youtubeVideoDetail) return;

    setYoutubeVideoAction('format');
    setYoutubeVideoDetailError('');

    try {
      const response = await api.formatYouTubeVideoTranscript(youtubeVideoDetail.id);
      applyYouTubeVideo(response.video);
      await refreshVideoListAfterDetailChange(response.video);
    } catch (caught) {
      setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось выполнить нейроформатирование.'));
    } finally {
      setYoutubeVideoAction('');
    }
  }

  async function createYouTubeVideoMarkdown() {
    if (!youtubeVideoDetail) return;

    setYoutubeVideoAction('markdown');
    setYoutubeVideoDetailError('');

    try {
      const response = await api.createYouTubeVideoMarkdown(youtubeVideoDetail.id);
      applyYouTubeVideo(response.video);
      await refreshVideoListAfterDetailChange(response.video);
    } catch (caught) {
      setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось создать Markdown.'));
    } finally {
      setYoutubeVideoAction('');
    }
  }

  async function trashSelectedScreenshots() {
    if (!youtubeVideoDetail || selectedActiveScreenshots.length === 0) return;

    setYoutubeVideoAction('trash');
    setYoutubeVideoDetailError('');

    try {
      const response = await api.trashYouTubeVideoScreenshots(youtubeVideoDetail.id, selectedActiveScreenshots);
      applyYouTubeVideo(response.video);
      await refreshVideoListAfterDetailChange(response.video);
    } catch (caught) {
      setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось перенести скриншоты в корзину.'));
    } finally {
      setYoutubeVideoAction('');
    }
  }

  async function restoreSelectedScreenshots() {
    if (!youtubeVideoDetail || selectedTrashedScreenshots.length === 0) return;

    setYoutubeVideoAction('restore');
    setYoutubeVideoDetailError('');

    try {
      const response = await api.restoreYouTubeVideoScreenshots(youtubeVideoDetail.id, selectedTrashedScreenshots);
      applyYouTubeVideo(response.video);
      if (lastLightboxTrash && selectedTrashedScreenshots.includes(lastLightboxTrash.fileName)) {
        setLastLightboxTrash(null);
      }
      await refreshVideoListAfterDetailChange(response.video);
    } catch (caught) {
      setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось восстановить скриншоты.'));
    } finally {
      setYoutubeVideoAction('');
    }
  }

  async function clearScreenshotsTrash() {
    if (!youtubeVideoDetail || youtubeVideoDetail.trashedScreenshots.length === 0) return;
    const confirmed = window.confirm('Окончательно удалить все скриншоты из корзины? Это действие нельзя отменить.');
    if (!confirmed) return;

    setYoutubeVideoAction('clear');
    setYoutubeVideoDetailError('');

    try {
      const response = await api.clearYouTubeVideoScreenshotsTrash(youtubeVideoDetail.id);
      applyYouTubeVideo(response.video);
      setLastLightboxTrash(null);
      await refreshVideoListAfterDetailChange(response.video);
    } catch (caught) {
      setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось очистить корзину.'));
    } finally {
      setYoutubeVideoAction('');
    }
  }

  function subscribeToYouTubeVideoJob(jobId: string, detailVideoId: string) {
    const eventSource = new EventSource(api.jobEventsUrl(jobId));
    youtubeVideoEventSourceRef.current = eventSource;

    eventSource.onmessage = (message) => {
      const event = parseProgressEvent(message.data);
      if (!event) return;

      if (event.type === 'progress') {
        updateYouTubeVideoTranscriptionStage(
          event.stage,
          event.progress,
          event.progress >= 100 ? 'done' : 'running',
          event.stage === 'transcribe'
        );
      }

      if (event.type === 'done') {
        completeYouTubeVideoTranscriptionStages();
        finishYouTubeVideoTranscriptionRun('done');
        setYoutubeVideoAction('');
        void reloadYouTubeVideoAfterJob(detailVideoId);
        youtubeVideoEventSourceRef.current = null;
        eventSource.close();
      }

      if (event.type === 'error') {
        finishYouTubeVideoTranscriptionRun('error');
        setYoutubeVideoAction('');
        setYoutubeVideoDetailError(event.error || 'Не удалось транскрибировать видео.');
        void reloadYouTubeVideoAfterJob(detailVideoId);
        youtubeVideoEventSourceRef.current = null;
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      if (youtubeVideoEventSourceRef.current === eventSource) {
        finishYouTubeVideoTranscriptionRun('error');
        setYoutubeVideoAction('');
        setYoutubeVideoDetailError('Потеряно соединение с потоком прогресса транскрибации видео.');
        youtubeVideoEventSourceRef.current = null;
      }
      eventSource.close();
    };
  }

  function updateYouTubeVideoTranscriptionStage(
    stageId: string,
    progress: number,
    nextStatus: StageStatus,
    indeterminate: boolean
  ) {
    const now = Date.now();

    setYoutubeVideoTranscriptionStages((currentStages) =>
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

  function completeYouTubeVideoTranscriptionStages() {
    const now = Date.now();
    setYoutubeVideoTranscriptionStages((currentStages) =>
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

  function finishYouTubeVideoTranscriptionRun(nextStatus: Exclude<RunStatus, 'idle' | 'running'>) {
    setYoutubeVideoTranscriptionStatus(nextStatus);
    setYoutubeVideoTranscriptionElapsedSeconds(Math.floor((Date.now() - youtubeVideoTranscriptionStartedAtRef.current) / 1000));
  }

  async function reloadYouTubeVideoAfterJob(id: string) {
    try {
      const response = await api.getYouTubeVideo(id);
      applyYouTubeVideo(response.video);
      await refreshVideoListAfterDetailChange(response.video);
    } catch (caught) {
      setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось обновить видео после транскрибации.'));
    }
  }

  async function refreshVideoListAfterDetailChange(video: YouTubeVideo) {
    setYoutubeVideos((current) => current.map((item) => item.id === video.id ? video : item));
    if (view === 'videos') {
      await loadYouTubeVideos();
    }
  }

  function updateVideoTranscriptForm<K extends keyof VideoTranscriptForm>(key: K, value: VideoTranscriptForm[K]) {
    setYoutubeVideoTranscriptForm((current) => ({ ...current, [key]: value }));
  }

  async function copyCleanTranscript(value: string) {
    const text = buildCleanTranscriptClipboardText(value);
    if (!text) return;

    try {
      await writeClipboardText(text);
      setCleanTranscriptCopyStatus('copied');

      if (cleanTranscriptCopyTimerRef.current !== null) {
        window.clearTimeout(cleanTranscriptCopyTimerRef.current);
      }
      cleanTranscriptCopyTimerRef.current = window.setTimeout(() => {
        setCleanTranscriptCopyStatus('idle');
        cleanTranscriptCopyTimerRef.current = null;
      }, 1600);
    } catch {
      window.alert('Не удалось скопировать текст. Выдели Clean Transcript вручную.');
    }
  }

  function toggleActiveScreenshot(fileName: string, checked: boolean) {
    setSelectedActiveScreenshots((current) => toggleSelection(current, fileName, checked));
  }

  function toggleTrashedScreenshot(fileName: string, checked: boolean) {
    setSelectedTrashedScreenshots((current) => toggleSelection(current, fileName, checked));
  }

  function openLightbox(scope: ScreenshotScope, screenshot: VideoScreenshot) {
    if (!youtubeVideoDetail) return;

    const screenshots = screenshotsForScope(youtubeVideoDetail, scope);
    const index = screenshots.findIndex((item) => item.fileName === screenshot.fileName);
    if (index < 0) return;

    setLightbox({ scope, index });
  }

  function navigateLightbox(direction: LightboxDirection) {
    setLightbox((current) => {
      if (!current || !youtubeVideoDetail) return current;

      const screenshots = screenshotsForScope(youtubeVideoDetail, current.scope);
      const nextIndex = getAdjacentLightboxIndex(current.index, screenshots.length, direction);
      return nextIndex === null ? null : { ...current, index: nextIndex };
    });
  }

  async function trashLightboxScreenshot() {
    if (!youtubeVideoDetail || !lightbox || lightbox.scope !== 'active' || lightboxDeleteInFlightRef.current) return;

    const screenshot = getLightboxScreenshot(youtubeVideoDetail, lightbox);
    if (!screenshot) return;

    const nextIndex = chooseNextLightboxIndex(lightbox.index, youtubeVideoDetail.screenshots.length);
    lightboxDeleteInFlightRef.current = true;
    setYoutubeVideoAction('trash');
    setYoutubeVideoDetailError('');

    try {
      const response = await api.trashYouTubeVideoScreenshots(youtubeVideoDetail.id, [screenshot.fileName]);
      setLastLightboxTrash({ videoId: youtubeVideoDetail.id, fileName: screenshot.fileName });
      applyYouTubeVideo(response.video);
      const nextScreenshots = screenshotsForScope(response.video, 'active');
      setLightbox(nextIndex === null || !nextScreenshots[nextIndex] ? null : { scope: 'active', index: nextIndex });
      await refreshVideoListAfterDetailChange(response.video);
    } catch (caught) {
      setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось перенести скриншот в корзину.'));
    } finally {
      lightboxDeleteInFlightRef.current = false;
      setYoutubeVideoAction('');
    }
  }

  async function restoreLastLightboxScreenshot() {
    if (
      !youtubeVideoDetail ||
      !lastLightboxTrash ||
      lastLightboxTrash.videoId !== youtubeVideoDetail.id ||
      youtubeVideoAction === 'restore'
    ) {
      return;
    }

    setYoutubeVideoAction('restore');
    setYoutubeVideoDetailError('');

    try {
      const response = await api.restoreYouTubeVideoScreenshots(youtubeVideoDetail.id, [lastLightboxTrash.fileName]);
      applyYouTubeVideo(response.video);
      const restoredIndex = getRestoredLightboxIndex(response.video.screenshots, lastLightboxTrash.fileName);
      setLastLightboxTrash(null);
      setLightbox(restoredIndex === null ? null : { scope: 'active', index: restoredIndex });
      await refreshVideoListAfterDetailChange(response.video);
    } catch (caught) {
      setYoutubeVideoDetailError(errorMessage(caught, 'Не удалось вернуть последний скриншот.'));
    } finally {
      setYoutubeVideoAction('');
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
      : view === 'videoDetail' && youtubeVideoTranscriptionStatus !== 'idle'
        ? youtubeVideoTranscriptionStatus
        : status;
  const lightboxScreenshot = youtubeVideoDetail && lightbox ? getLightboxScreenshot(youtubeVideoDetail, lightbox) : null;
  const lightboxTotalItems = youtubeVideoDetail && lightbox ? screenshotsForScope(youtubeVideoDetail, lightbox.scope).length : 0;
  const canUndoLightboxTrash = Boolean(
    youtubeVideoDetail &&
    lastLightboxTrash &&
    lastLightboxTrash.videoId === youtubeVideoDetail.id
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
              aria-current={isNavigationItemActive(item.id, view) ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center rounded-md border px-4 py-2 text-sm font-medium transition',
                isNavigationItemActive(item.id, view)
                  ? 'border-neutral-950 bg-neutral-950 text-white'
                  : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {view === 'videos' && (
          <section className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Видео</h2>
              <Button
                type="button"
                variant="secondary"
                className="w-fit"
                onClick={() => void loadYouTubeVideos({ showLoading: true, showError: true })}
                disabled={youtubeVideosLoading}
              >
                <RefreshCw className="h-4 w-4" />
                Обновить
              </Button>
            </div>

            {youtubeVideosError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{youtubeVideosError}</p>
            )}

            {youtubeVideosLoading && (
              <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">Загружаю...</p>
            )}

            {!youtubeVideosLoading && youtubeVideos.length === 0 && !youtubeVideosError && (
              <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">Видео пока не добавлены.</p>
            )}

            {youtubeVideos.length > 0 && (
              <section className="grid gap-4 lg:grid-cols-[240px_1fr] lg:items-start">
                <aside className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
                  <h3 className="px-1 pb-2 text-sm font-semibold">Источники</h3>
                  <nav className="grid gap-1" aria-label="Источники видео">
                    {youtubeChannelFilters.map((filter) => {
                      const selected = filter.id === selectedYoutubeChannelId;
                      return (
                        <button
                          type="button"
                          key={filter.id}
                          aria-current={selected ? 'true' : undefined}
                          className={cn(
                            'grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition',
                            selected
                              ? 'bg-neutral-950 font-semibold text-white'
                              : 'text-neutral-800 hover:bg-neutral-100'
                          )}
                          onClick={() => setSelectedYoutubeChannelId(filter.id)}
                        >
                          <span className="truncate">{filter.label}</span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs',
                              selected ? 'bg-white text-neutral-950' : 'bg-neutral-100 text-neutral-600'
                            )}
                          >
                            ({filter.count})
                          </span>
                        </button>
                      );
                    })}
                  </nav>
                </aside>

                <section className="grid gap-3">
                  {filteredYoutubeVideos.length === 0 && (
                    <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">В этом канале пока нет видео.</p>
                  )}

                  {filteredYoutubeVideos.map((video) => (
                    <article key={video.id} className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-[160px_1fr]">
                      <VideoThumbnailPreview video={video} />
                      <div className="grid gap-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="text-base font-semibold break-words">
                            <Link
                              href={buildVideoDetailPath(video.id)}
                              className="rounded-sm text-neutral-950 underline-offset-4 transition hover:text-neutral-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
                              aria-label={`Подробнее о ${videoDisplayTitle(video)}`}
                            >
                              {videoDisplayTitle(video)}
                            </Link>
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            <VideoSourceBadge video={video} />
                            <Badge variant="secondary">{formatYouTubeVideoStatus(video.status)}</Badge>
                          </div>
                        </div>
                        {(video.channelTitle || video.uploader) && <p className="text-sm text-neutral-600">{video.channelTitle || video.uploader}</p>}
                        {video.sourceType === 'file' && video.originalFileName && (
                          <p className="text-sm text-neutral-600">{video.originalFileName}</p>
                        )}
                        <p className="text-xs text-neutral-500">Добавлено: {formatDateTime(video.createdAt)}</p>
                        <p className="text-sm text-neutral-700">{formatTranscriptAvailability(video)}</p>
                        {video.transcriptionError && (
                          <p className="text-sm font-medium text-red-700">{previewText(video.transcriptionError, 140)}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={video.status === 'done' ? 'secondary' : 'default'}
                            className="w-fit"
                            onClick={() => void startYouTubeVideoTranscription(video)}
                            disabled={video.status === 'processing' || youtubeVideoAction === 'transcribe'}
                          >
                            <Play className="h-4 w-4" />
                            {video.status === 'processing' ? 'В работе' : video.status === 'done' ? 'Транскрибировать заново' : 'Транскрибировать'}
                          </Button>
                          <Button asChild className="w-fit">
                            <Link href={buildVideoDetailPath(video.id)}>
                              Подробнее
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </section>
              </section>
            )}
          </section>
        )}

        {view === 'videoDetail' && (
          <section className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button asChild variant="secondary" className="w-fit">
                <Link href="/videos">
                  <ArrowLeft className="h-4 w-4" />
                  Назад
                </Link>
              </Button>
            </div>

            {youtubeVideoDetailError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{youtubeVideoDetailError}</p>
            )}

            {youtubeVideoDetailLoading && (
              <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">Загружаю видео...</p>
            )}

            {!youtubeVideoDetailLoading && youtubeVideoDetail && (
              <section className="grid gap-5">
                <article className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-[280px_1fr]">
                  <VideoThumbnailPreview video={youtubeVideoDetail} iconClassName="h-10 w-10" />
                  <div className="grid content-start gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="text-xl font-semibold break-words">{videoDisplayTitle(youtubeVideoDetail)}</h2>
                      <div className="flex flex-wrap gap-2">
                        <VideoSourceBadge video={youtubeVideoDetail} />
                        <Badge variant="secondary">{formatYouTubeVideoStatus(youtubeVideoDetail.status)}</Badge>
                      </div>
                    </div>
                    {(youtubeVideoDetail.channelTitle || youtubeVideoDetail.originalFileName) && (
                      <p className="text-sm text-neutral-600">{youtubeVideoDetail.channelTitle || youtubeVideoDetail.originalFileName}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="w-fit"
                        onClick={() => void startYouTubeVideoTranscription(youtubeVideoDetail)}
                        disabled={youtubeVideoDetail.status === 'processing' || youtubeVideoAction === 'transcribe'}
                      >
                        <Play className="h-4 w-4" />
                        {youtubeVideoDetail.status === 'processing' ? 'В работе' : youtubeVideoDetail.status === 'done' ? 'Транскрибировать заново' : 'Транскрибировать'}
                      </Button>
                    </div>
                  </div>
                </article>

                <Tabs defaultValue="data" className="grid gap-4">
                  <TabsList className="h-auto w-full flex-wrap justify-start">
                    <TabsTrigger value="data">Данные видео</TabsTrigger>
                    <TabsTrigger value="transcription">Транскрипция</TabsTrigger>
                    <TabsTrigger value="screenshots">Скриншоты</TabsTrigger>
                    {isYouTubeLibraryVideo(youtubeVideoDetail) && <TabsTrigger value="formats">Форматы</TabsTrigger>}
                  </TabsList>

                  <TabsContent value="transcription" className="mt-0 grid gap-4">
                    <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
                        <label className="grid gap-2 text-sm font-medium">
                          Transcription engine
                          <Select
                            value={engine}
                            onValueChange={(value) => setEngine(value as TranscriptionEngine)}
                            disabled={youtubeVideoAction === 'transcribe' || youtubeVideoDetail.status === 'processing'}
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
                        <Button
                          type="button"
                          className="w-fit"
                          onClick={() => void startYouTubeVideoTranscription(youtubeVideoDetail)}
                          disabled={youtubeVideoDetail.status === 'processing' || youtubeVideoAction === 'transcribe'}
                        >
                          <Play className="h-4 w-4" />
                          {youtubeVideoAction === 'transcribe' || youtubeVideoDetail.status === 'processing' ? 'Транскрибирую...' : 'Транскрибировать'}
                        </Button>
                      </div>

                      <div className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={youtubeVideoScreenshotsEnabled}
                            onChange={(event) => setYoutubeVideoScreenshotsEnabled(event.target.checked)}
                            disabled={youtubeVideoAction === 'transcribe' || youtubeVideoDetail.status === 'processing'}
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
                            value={youtubeVideoScreenshotIntervalSeconds}
                            onChange={(event) => setYoutubeVideoScreenshotIntervalSeconds(normalizeScreenshotIntervalInput(event.target.value))}
                            disabled={youtubeVideoAction === 'transcribe' || youtubeVideoDetail.status === 'processing' || !youtubeVideoScreenshotsEnabled}
                          />
                        </label>
                      </div>
                    </section>

                    {youtubeVideoTranscriptionStages.length > 0 && youtubeVideoTranscriptionStatus !== 'idle' && (
                      <ProgressPanel
                        stages={youtubeVideoTranscriptionStages}
                        status={youtubeVideoTranscriptionStatus}
                        elapsedSeconds={youtubeVideoTranscriptionElapsedSeconds}
                      />
                    )}

                    {youtubeVideoDetail.transcriptionError && (
                      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                        {youtubeVideoDetail.transcriptionError}
                      </p>
                    )}

                    <VideoTranscriptView
                      form={youtubeVideoTranscriptForm}
                      onSave={() => void saveYouTubeVideoTranscript()}
                      onFormat={() => void formatYouTubeVideoTranscript()}
                      onCreateMarkdown={() => void createYouTubeVideoMarkdown()}
                      onFormChange={updateVideoTranscriptForm}
                      action={youtubeVideoAction}
                      cleanCopyStatus={cleanTranscriptCopyStatus}
                      onCopyCleanTranscript={() => void copyCleanTranscript(youtubeVideoTranscriptForm.cleanText)}
                    />
                  </TabsContent>

                  <TabsContent value="screenshots" className="mt-0 grid gap-4">
                    <VideoScreenshotsView
                      video={youtubeVideoDetail}
                      action={youtubeVideoAction}
                      selectedActive={selectedActiveScreenshots}
                      selectedTrash={selectedTrashedScreenshots}
                      onToggleActive={toggleActiveScreenshot}
                      onToggleTrash={toggleTrashedScreenshot}
                      onTrashSelected={() => void trashSelectedScreenshots()}
                      onRestoreSelected={() => void restoreSelectedScreenshots()}
                      onClearTrash={() => void clearScreenshotsTrash()}
                      onOpenLightbox={openLightbox}
                    />
                  </TabsContent>

                  <TabsContent value="data" className="mt-0 grid gap-4">
                    <VideoDataView
                      video={youtubeVideoDetail}
                      form={youtubeVideoTranscriptForm}
                      onFormChange={updateVideoTranscriptForm}
                      metadataError={youtubeVideoMetadataError}
                      thumbnailError={youtubeVideoThumbnailError}
                      metadataRefreshing={youtubeVideoDetailRefreshing}
                      action={youtubeVideoAction}
                      onSave={() => void saveYouTubeVideoTranscript()}
                      onRefreshMetadata={() => void refreshYouTubeVideoMetadata(youtubeVideoDetail.id)}
                      onThumbnailUpload={(file) => void uploadYouTubeVideoThumbnail(file)}
                    />
                  </TabsContent>

                  {isYouTubeLibraryVideo(youtubeVideoDetail) && (
                    <TabsContent value="formats" className="mt-0 grid gap-4">
                      <VideoFormatsView video={youtubeVideoDetail} />
                    </TabsContent>
                  )}
                </Tabs>
              </section>
            )}
          </section>
        )}

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
                  Скриншотов создано: {screenshotsCount}. Для сохраненных YouTube-видео Markdown создается в деталке видео.
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

                <div className="grid gap-2 text-sm font-medium">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Clean transcript</span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-fit"
                      onClick={() => void copyCleanTranscript(cleanText)}
                      disabled={!buildCleanTranscriptClipboardText(cleanText)}
                    >
                      {cleanTranscriptCopyStatus === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {cleanTranscriptCopyStatus === 'copied' ? 'Скопировано' : 'Скопировать'}
                    </Button>
                  </div>
                  <Textarea className="min-h-72" value={cleanText} readOnly placeholder="Cleaned transcript will appear here." />
                </div>

                <label className="grid gap-2 text-sm font-medium">
                  Raw transcript
                  <Textarea className="min-h-72" value={rawText} readOnly placeholder="Raw transcription result will appear here." />
                </label>
              </section>

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
            deleting={youtubeVideoAction === 'trash'}
            restoring={youtubeVideoAction === 'restore'}
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

function VideoSourceBadge({ video }: { video: YouTubeVideo }) {
  if (!isYouTubeLibraryVideo(video)) {
    return <Badge variant="secondary">{videoSourceLabel(video)}</Badge>;
  }

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Открыть ${videoDisplayTitle(video)} на YouTube`}
      className="inline-flex rounded-full focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2"
    >
      <Badge variant="secondary" className="transition hover:bg-neutral-200 hover:text-neutral-950">
        {videoSourceLabel(video)}
      </Badge>
    </a>
  );
}

function VideoTranscriptView({
  form,
  onSave,
  onFormat,
  onCreateMarkdown,
  onFormChange,
  action,
  cleanCopyStatus,
  onCopyCleanTranscript
}: {
  form: VideoTranscriptForm;
  onSave: () => void;
  onFormat: () => void;
  onCreateMarkdown: () => void;
  onFormChange: VideoTranscriptFormChange;
  action: VideoAction;
  cleanCopyStatus: CopyStatus;
  onCopyCleanTranscript: () => void;
}) {
  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">Текст транскрипции</h3>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onFormat} disabled={action === 'format'}>
            <Sparkles className={cn('h-4 w-4', action === 'format' && 'animate-pulse')} />
            {action === 'format' ? 'Форматирую...' : 'Нейроформатирование'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCreateMarkdown} disabled={action === 'markdown'}>
            <FileText className="h-4 w-4" />
            {action === 'markdown' ? 'Создаю...' : 'Создать Markdown'}
          </Button>
          <Button type="button" onClick={onSave} disabled={action === 'save'}>
            <Save className="h-4 w-4" />
            {action === 'save' ? 'Сохраняю...' : 'Сохранить правки'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Содержимое</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
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
          <div className="grid gap-2 text-sm font-medium">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Clean transcript</span>
              <Button
                type="button"
                variant="secondary"
                className="w-fit"
                onClick={onCopyCleanTranscript}
                disabled={!buildCleanTranscriptClipboardText(form.cleanText)}
              >
                {cleanCopyStatus === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {cleanCopyStatus === 'copied' ? 'Скопировано' : 'Скопировать'}
              </Button>
            </div>
            <Textarea className="min-h-80" value={form.cleanText} onChange={(event) => onFormChange('cleanText', event.target.value)} />
          </div>
          <label className="grid gap-2 text-sm font-medium">
            Raw transcript
            <Textarea className="min-h-80" value={form.rawText} onChange={(event) => onFormChange('rawText', event.target.value)} />
          </label>
        </CardContent>
      </Card>
    </section>
  );
}

function VideoScreenshotsView({
  video,
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
  video: YouTubeVideo;
  action: VideoAction;
  selectedActive: string[];
  selectedTrash: string[];
  onToggleActive: (fileName: string, checked: boolean) => void;
  onToggleTrash: (fileName: string, checked: boolean) => void;
  onTrashSelected: () => void;
  onRestoreSelected: () => void;
  onClearTrash: () => void;
  onOpenLightbox: (scope: ScreenshotScope, screenshot: VideoScreenshot) => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader className="grid gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Галерея</CardTitle>
            <p className="mt-1 text-sm text-neutral-600">Активные скриншоты попадают в transcript.md.</p>
          </div>
          <Button type="button" variant="secondary" onClick={onTrashSelected} disabled={selectedActive.length === 0 || action === 'trash'}>
            <Trash2 className="h-4 w-4" />
            {action === 'trash' ? 'Переношу...' : `В корзину (${selectedActive.length})`}
          </Button>
        </CardHeader>
        <CardContent>
          <ScreenshotGrid
            screenshots={video.screenshots}
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
              disabled={video.trashedScreenshots.length === 0 || action === 'clear'}
            >
              <Trash2 className="h-4 w-4" />
              {action === 'clear' ? 'Удаляю...' : 'Очистить'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScreenshotGrid
            screenshots={video.trashedScreenshots}
            scope="trash"
            selected={selectedTrash}
            emptyText="Корзина пуста."
            onToggle={onToggleTrash}
            onOpen={onOpenLightbox}
          />
        </CardContent>
      </Card>
    </section>
  );
}

function VideoThumbnailPreview({
  video,
  iconClassName = 'h-8 w-8'
}: {
  video: Pick<YouTubeVideo, 'thumbnailUrl'>;
  iconClassName?: string;
}) {
  const thumbnailUrl = videoThumbnailUrl(video);

  if (thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt=""
        className="aspect-video w-full rounded-md border border-neutral-200 object-cover"
      />
    );
  }

  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-md border border-neutral-200 bg-neutral-100 text-neutral-500">
      <FileVideo className={iconClassName} />
    </div>
  );
}

function VideoDataView({
  video,
  form,
  onFormChange,
  metadataError,
  thumbnailError,
  metadataRefreshing,
  action,
  onSave,
  onRefreshMetadata,
  onThumbnailUpload
}: {
  video: YouTubeVideo;
  form: VideoTranscriptForm;
  onFormChange: VideoTranscriptFormChange;
  metadataError: string;
  thumbnailError: string;
  metadataRefreshing: boolean;
  action: VideoAction;
  onSave: () => void;
  onRefreshMetadata: () => void;
  onThumbnailUpload: (file: File) => void;
}) {
  const isYouTubeVideo = isYouTubeLibraryVideo(video);
  const handleThumbnailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) {
      onThumbnailUpload(file);
    }
  };

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">Данные видео</h3>
        <div className="flex flex-wrap gap-2">
          {isYouTubeVideo && (
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              onClick={onRefreshMetadata}
              disabled={metadataRefreshing}
            >
              <RefreshCw className={cn('h-4 w-4', metadataRefreshing && 'animate-spin')} />
              {metadataRefreshing ? 'Обновляю...' : 'Обновить метаданные'}
            </Button>
          )}
          <Button type="button" className="w-fit" onClick={onSave} disabled={action === 'save'}>
            <Save className="h-4 w-4" />
            {action === 'save' ? 'Сохраняю...' : 'Сохранить правки'}
          </Button>
        </div>
      </div>

      {metadataError && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{metadataError}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Превью</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(220px,360px)_minmax(0,1fr)] md:items-start">
          <VideoThumbnailPreview video={video} iconClassName="h-10 w-10" />
          <div className="grid gap-3">
            <label className="grid gap-2 text-sm font-medium">
              Изображение
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={action === 'thumbnail'}
                onChange={handleThumbnailChange}
              />
            </label>
            {action === 'thumbnail' && (
              <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">Загружаю превью...</p>
            )}
            {thumbnailError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{thumbnailError}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Карточка</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            Название
            <Input value={form.title} onChange={(event) => onFormChange('title', event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {isYouTubeVideo ? 'Канал' : 'Источник / заметка'}
            <Input value={form.channelTitle} onChange={(event) => onFormChange('channelTitle', event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Описание
            <Textarea className="min-h-32" value={form.description} onChange={(event) => onFormChange('description', event.target.value)} />
          </label>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Основное</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {renderMetaRow('ID в CRM', video.id)}
            {renderMetaRow('Источник', videoSourceLabel(video))}
            {isYouTubeVideo
              ? renderMetaRow('YouTube ID', video.youtubeVideoId)
              : renderMetaRow('Файл', video.originalFileName)}
            {renderMetaRow('Добавлено', formatDateTime(video.createdAt))}
            {renderMetaRow('Обновлено', formatDateTime(video.updatedAt))}
            {isYouTubeVideo && renderMetaRow('Метаданные загружены', video.metadataFetchedAt ? formatDateTime(video.metadataFetchedAt) : '')}
            {renderMetaRow('Длительность', formatVideoDuration(video))}
            {isYouTubeVideo && renderMetaRow('Дата загрузки', formatYouTubeUploadDate(video.uploadDate))}
            {isYouTubeVideo && renderMetaRow('Timestamp публикации', video.timestamp ? formatDateTime(video.timestamp * 1000) : '')}
            {renderMetaRow(isYouTubeVideo ? 'Ссылка' : 'Source path', isYouTubeVideo ? video.webpageUrl || video.url : video.sourcePath)}
            {renderMetaRow('Транскрипт', formatTranscriptAvailability(video))}
            {renderMetaRow('Job', video.transcriptionJobId)}
            {renderMetaRow('Engine', video.transcriptionEngine)}
            {renderMetaRow('Старт транскрибации', video.transcriptionStartedAt ? formatDateTime(video.transcriptionStartedAt) : '')}
            {renderMetaRow('Финиш транскрибации', video.transcriptionFinishedAt ? formatDateTime(video.transcriptionFinishedAt) : '')}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isYouTubeVideo ? 'Канал' : 'Источник'}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {renderMetaRow(isYouTubeVideo ? 'Канал' : 'Источник / заметка', video.channelTitle)}
            {isYouTubeVideo && renderMetaRow('Channel ID', video.channelId)}
            {isYouTubeVideo && renderMetaRow('Channel URL', video.channelUrl)}
            {isYouTubeVideo && renderMetaRow('Uploader', video.uploader)}
            {isYouTubeVideo && renderMetaRow('Uploader ID', video.uploaderId)}
            {isYouTubeVideo && renderMetaRow('Uploader URL', video.uploaderUrl)}
          </CardContent>
        </Card>

        {isYouTubeVideo && (
          <Card>
            <CardHeader>
              <CardTitle>Статистика</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {renderMetaRow('Просмотры', formatOptionalNumber(video.viewCount))}
              {renderMetaRow('Лайки', formatOptionalNumber(video.likeCount))}
              {renderMetaRow('Комментарии', formatOptionalNumber(video.commentCount))}
              {renderMetaRow('Язык', video.language)}
              {renderMetaRow('Доступность', video.availability)}
              {renderMetaRow('Live status', video.liveStatus)}
              {renderMetaRow('Возрастное ограничение', video.ageLimit === null ? '' : `${video.ageLimit}+`)}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Теги и категории</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="grid gap-1">
              <span className="text-xs font-semibold uppercase text-neutral-500">Категории</span>
              <div className="flex flex-wrap gap-2">
                {video.categories.length > 0
                  ? video.categories.map((category) => <Badge key={category} variant="secondary">{category}</Badge>)
                  : <span className="text-neutral-500">Нет данных</span>}
              </div>
            </div>
            <div className="grid gap-1">
              <span className="text-xs font-semibold uppercase text-neutral-500">Теги</span>
              <div className="flex flex-wrap gap-2">
                {video.tags.length > 0
                  ? video.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)
                  : <span className="text-neutral-500">Нет данных</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Описание</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-800">{video.description || 'Нет данных'}</p>
        </CardContent>
      </Card>
    </section>
  );
}

function VideoFormatsView({ video }: { video: YouTubeVideo }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Форматы</CardTitle>
      </CardHeader>
      <CardContent>
        {video.formats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                  <th className="py-2 pr-3">Формат</th>
                  <th className="py-2 pr-3">Разрешение</th>
                  <th className="py-2 pr-3">FPS</th>
                  <th className="py-2 pr-3">Расширение</th>
                  <th className="py-2 pr-3">Размер</th>
                  <th className="py-2 pr-3">Аудио</th>
                </tr>
              </thead>
              <tbody>
                {video.formats.map((format) => (
                  <tr key={format.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 font-medium">{format.label || format.id}</td>
                    <td className="py-2 pr-3">{format.resolution || (format.width && format.height ? `${format.width}x${format.height}` : '') || '—'}</td>
                    <td className="py-2 pr-3">{format.fps || '—'}</td>
                    <td className="py-2 pr-3">{format.ext || '—'}</td>
                    <td className="py-2 pr-3">{format.sizeLabel || '—'}</td>
                    <td className="py-2 pr-3">{format.hasAudio ? 'Есть' : 'Отдельно'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">Нет данных о форматах.</p>
        )}
      </CardContent>
    </Card>
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
  screenshots: VideoScreenshot[];
  scope: ScreenshotScope;
  selected: string[];
  emptyText: string;
  onToggle: (fileName: string, checked: boolean) => void;
  onOpen: (scope: ScreenshotScope, screenshot: VideoScreenshot) => void;
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
  screenshot: VideoScreenshot;
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

function screenshotsForScope(video: YouTubeVideo, scope: ScreenshotScope): VideoScreenshot[] {
  return scope === 'active' ? video.screenshots : video.trashedScreenshots;
}

function getLightboxScreenshot(video: YouTubeVideo, lightbox: LightboxState): VideoScreenshot | null {
  return screenshotsForScope(video, lightbox.scope)[lightbox.index] || null;
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

function isYouTubeLibraryVideo(video: YouTubeVideo): boolean {
  return video.sourceType !== 'file';
}

function videoDisplayTitle(video: YouTubeVideo): string {
  return video.title || video.originalFileName || video.url;
}

function videoSourceLabel(video: YouTubeVideo): string {
  return isYouTubeLibraryVideo(video) ? 'YouTube' : 'Локальный файл';
}

function createVideoTranscriptForm(video?: YouTubeVideo): VideoTranscriptForm {
  return {
    title: video?.title || video?.originalFileName || '',
    description: video?.description || '',
    channelTitle: video?.channelTitle || '',
    summary: video?.summary || '',
    formattedText: video?.formattedText || '',
    cleanText: video?.cleanText || '',
    rawText: video?.rawText || ''
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

function videoThumbnailUrl(video: Pick<YouTubeVideo, 'thumbnailUrl'>): string {
  return apiAssetUrl(video.thumbnailUrl);
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

function isNavigationItemActive(itemId: AppView, view: AppView) {
  return itemId === view || (itemId === 'videos' && view === 'videoDetail');
}

function formatDateTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 'Нет данных';
  return new Date(value).toLocaleString('ru-RU');
}

function formatOptionalNumber(value: number | null) {
  return value === null ? '' : new Intl.NumberFormat('ru-RU').format(value);
}

function formatVideoDuration(video: YouTubeVideo) {
  if (video.durationLabel) return video.durationLabel;
  if (video.durationSeconds === null) return '';
  return formatElapsed(video.durationSeconds);
}

function formatYouTubeUploadDate(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function renderMetaRow(label: string, value: React.ReactNode) {
  const displayValue = value === null || value === undefined || value === '' ? 'Нет данных' : value;
  return (
    <div className="grid gap-1 border-b border-neutral-100 pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs font-semibold uppercase text-neutral-500">{label}</span>
      <span className="break-words text-neutral-900">{displayValue}</span>
    </div>
  );
}

function formatYouTubeVideoStatus(status: YouTubeVideo['status']) {
  return {
    added: 'Добавлено',
    processing: 'В работе',
    done: 'Готово',
    error: 'Ошибка'
  }[status];
}

function formatTranscriptAvailability(video: YouTubeVideo) {
  if (video.status === 'processing') return 'Транскрибация выполняется';
  if (video.status === 'error') return 'Транскрибация завершилась ошибкой';
  if (video.cleanText || video.rawText || video.formattedText) return 'Транскрипт есть';
  return 'Транскрипта пока нет';
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

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error('Clipboard copy failed.');
  }
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
