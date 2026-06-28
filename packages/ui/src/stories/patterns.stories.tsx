import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download, FileAudio, FileVideo, WandSparkles } from 'lucide-react';
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea
} from '../index.js';

const meta: Meta = {
  title: 'Patterns/Transcribator',
  parameters: {
    layout: 'centered'
  }
};

export default meta;

type Story = StoryObj<typeof meta>;

export const TranscriptionForm: Story = {
  render: () => (
    <Card className="storybook-panel">
      <CardHeader>
        <CardTitle>Новая транскрибация</CardTitle>
        <p className="text-sm leading-6 text-neutral-500">
          Форма для загрузки файла, выбора движка и запуска распознавания.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="file">
          <TabsList>
            <TabsTrigger value="file">Файл</TabsTrigger>
            <TabsTrigger value="youtube">YouTube</TabsTrigger>
          </TabsList>
          <TabsContent className="storybook-stack" value="file">
            <div className="storybook-field">
              <label className="storybook-label" htmlFor="audio-file">
                Аудио или видео
              </label>
              <Input accept="audio/*,video/*" id="audio-file" type="file" />
            </div>
            <EngineSelect />
            <Button>
              <WandSparkles className="h-4 w-4" />
              Начать транскрибацию
            </Button>
          </TabsContent>
          <TabsContent className="storybook-stack" value="youtube">
            <div className="storybook-field">
              <label className="storybook-label" htmlFor="youtube-url">
                YouTube URL
              </label>
              <Input
                defaultValue="https://www.youtube.com/watch?v=tWwRAia3cs"
                id="youtube-url"
                type="url"
              />
            </div>
            <EngineSelect />
            <Button>Получить текст из видео</Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
};

export const ProgressPanel: Story = {
  render: () => (
    <Card className="storybook-panel">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="grid gap-1">
          <CardTitle>meeting-recording.mp3</CardTitle>
          <p className="text-sm text-neutral-500">Идет распознавание речи</p>
        </div>
        <Badge>В работе</Badge>
      </CardHeader>
      <CardContent className="storybook-stack">
        <Progress value={64} />
        <div className="grid gap-3">
          {[
            ['Файл загружен', 'success'],
            ['Аудио извлечено', 'success'],
            ['Речь распознается', 'secondary'],
            ['Результат готовится', 'secondary']
          ].map(([title, variant]) => (
            <div className="flex items-center justify-between gap-4 rounded-md border border-neutral-200 p-3" key={title}>
              <span className="text-sm text-neutral-800">{title}</span>
              <Badge variant={variant as 'success' | 'secondary'}>
                {variant === 'success' ? 'Готово' : 'В очереди'}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
};

export const ResultSummary: Story = {
  render: () => (
    <Card className="storybook-panel">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="grid gap-1">
          <CardTitle>Результат</CardTitle>
          <p className="text-sm text-neutral-500">38 минут, 2 спикера</p>
        </div>
        <Badge variant="success">Завершено</Badge>
      </CardHeader>
      <CardContent className="storybook-stack">
        <Textarea
          defaultValue="Команда согласовала структуру проекта, добавление UI Kit и отдельную вкладку для скачивания видео. Следующий шаг: проверить сценарии в браузере и закрепить изменения в документации."
          readOnly
        />
        <div className="storybook-row">
          <Button>
            <Download className="h-4 w-4" />
            Скачать TXT
          </Button>
          <Button variant="secondary">Скопировать</Button>
          <Button variant="ghost">Открыть видео</Button>
        </div>
      </CardContent>
    </Card>
  )
};

export const RecentTasksCard: Story = {
  render: () => (
    <Card className="storybook-panel">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="grid gap-1">
          <CardTitle>Последние задачи</CardTitle>
          <p className="text-sm text-neutral-500">Недавние транскрибации и скачивания</p>
        </div>
        <FileVideo className="h-5 w-5 text-neutral-500" />
      </CardHeader>
      <CardContent className="grid gap-3">
        {[
          ['Созвон по архитектуре', 'Транскрибация', '18 мин', 'success'],
          ['Видео с YouTube', 'Скачивание', '1080p', 'secondary'],
          ['Интервью клиента', 'Транскрибация', '42 мин', 'error']
        ].map(([title, kind, detail, variant]) => (
          <div className="flex items-center justify-between gap-4 rounded-md border border-neutral-200 p-3" key={title}>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100">
                <FileAudio className="h-4 w-4 text-neutral-700" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-950">{title}</p>
                <p className="text-xs text-neutral-500">
                  {kind} · {detail}
                </p>
              </div>
            </div>
            <Badge variant={variant as 'success' | 'secondary' | 'error'}>
              {variant === 'success' ? 'Готово' : variant === 'error' ? 'Ошибка' : 'В очереди'}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
};

function EngineSelect() {
  return (
    <div className="storybook-field">
      <label className="storybook-label">Движок распознавания</label>
      <Select defaultValue="mlx-whisper">
        <SelectTrigger>
          <SelectValue placeholder="Выберите движок" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="mlx-whisper">MLX Whisper</SelectItem>
            <SelectItem value="openai-whisper">OpenAI Whisper</SelectItem>
            <SelectItem value="faster-whisper">Faster Whisper</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
