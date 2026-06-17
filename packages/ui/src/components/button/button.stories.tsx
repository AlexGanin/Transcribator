import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download, PlayCircle } from 'lucide-react';
import { Button } from './index.js';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered'
  },
  args: {
    children: 'Начать транскрибацию'
  }
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Проверить файл'
  }
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Очистить'
  }
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Удалить запись'
  }
};

export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Скачать TXT'
  }
};

export const Icon: Story = {
  render: () => (
    <Button aria-label="Скачать видео" size="icon">
      <Download className="h-4 w-4" />
    </Button>
  )
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: 'Ожидание файла'
  }
};

export const WithLucideIcon: Story = {
  render: () => (
    <Button>
      <PlayCircle className="h-4 w-4" />
      Запустить
    </Button>
  )
};
