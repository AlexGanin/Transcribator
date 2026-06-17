import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from './index.js';

const meta: Meta<typeof Textarea> = {
  title: 'UI/Textarea',
  component: Textarea,
  parameters: {
    layout: 'centered'
  },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    )
  ]
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    placeholder: 'Здесь появится текст транскрибации'
  }
};

export const Summary: Story = {
  args: {
    defaultValue: 'Короткая выжимка: команда согласовала запуск, сроки и формат финального отчета.'
  }
};

export const CleanTranscript: Story = {
  args: {
    defaultValue:
      'Спикер 1: Давайте зафиксируем следующий шаг.\nСпикер 2: Я подготовлю файл и отправлю его сегодня вечером.'
  }
};

export const ReadonlyResult: Story = {
  args: {
    readOnly: true,
    defaultValue:
      'Готовый результат можно выделить, скопировать или скачать в отдельный файл без риска случайной правки.'
  }
};
