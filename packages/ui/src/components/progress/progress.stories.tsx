import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '../badge/index.js';
import { Progress } from './index.js';

const meta: Meta<typeof Progress> = {
  title: 'UI/Progress',
  component: Progress,
  parameters: {
    layout: 'centered'
  },
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    )
  ]
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Zero: Story = {
  args: {
    value: 0
  }
};

export const ThirtyFive: Story = {
  args: {
    value: 35
  }
};

export const Seventy: Story = {
  args: {
    value: 70
  }
};

export const Complete: Story = {
  args: {
    value: 100
  }
};

export const TranscriptionStages: Story = {
  render: () => (
    <div className="storybook-stack">
      {[
        ['Загрузка файла', 100, 'success'],
        ['Извлечение аудио', 100, 'success'],
        ['Распознавание речи', 70, 'secondary'],
        ['Сборка результата', 0, 'secondary']
      ].map(([title, value, variant]) => (
        <div className="grid gap-2" key={title}>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-neutral-950">{title}</span>
            <Badge variant={variant as 'success' | 'secondary'}>{value}%</Badge>
          </div>
          <Progress value={value as number} />
        </div>
      ))}
    </div>
  )
};
