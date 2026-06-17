import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '../badge/index.js';
import { Button } from '../button/index.js';
import { Card, CardContent, CardHeader, CardTitle } from './index.js';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  parameters: {
    layout: 'centered'
  }
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Base: Story = {
  render: () => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>Карточка</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-neutral-600">
          Базовый контейнер для рабочих блоков интерфейса.
        </p>
      </CardContent>
    </Card>
  )
};

export const TranscriptionResult: Story = {
  render: () => (
    <Card className="w-[480px]">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="grid gap-1">
          <CardTitle>Итог транскрибации</CardTitle>
          <p className="text-sm text-neutral-500">meeting-recording.mp3</p>
        </div>
        <Badge variant="success">Готово</Badge>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm leading-6 text-neutral-700">
          Клиент подтвердил план запуска. Следующий шаг: подготовить короткую выжимку и список задач.
        </p>
        <div className="storybook-row">
          <Button size="sm">Скачать TXT</Button>
          <Button size="sm" variant="secondary">
            Скопировать
          </Button>
        </div>
      </CardContent>
    </Card>
  )
};

export const History: Story = {
  render: () => (
    <Card className="w-[520px]">
      <CardHeader>
        <CardTitle>История</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {[
          ['Созвон с командой', '12 мин', 'success'],
          ['Интервью клиента', '37 мин', 'secondary'],
          ['Запись вебинара', '1 ч 08 мин', 'error']
        ].map(([title, duration, variant]) => (
          <div className="flex items-center justify-between gap-4 rounded-md border border-neutral-200 p-3" key={title}>
            <div>
              <p className="text-sm font-medium text-neutral-950">{title}</p>
              <p className="text-xs text-neutral-500">{duration}</p>
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
