import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './index.js';

const meta: Meta = {
  title: 'UI/Select',
  parameters: {
    layout: 'centered'
  }
};

export default meta;

type Story = StoryObj<typeof meta>;

export const TranscriptionEngineSelect: Story = {
  render: () => (
    <div className="w-[320px]">
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
  )
};

export const Disabled: Story = {
  render: () => (
    <div className="w-[320px]">
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Движок недоступен" />
        </SelectTrigger>
      </Select>
    </div>
  )
};
