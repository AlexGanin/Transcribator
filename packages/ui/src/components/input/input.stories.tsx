import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './index.js';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
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

export const Default: Story = {
  args: {
    defaultValue: 'meeting-recording.mp3'
  }
};

export const Placeholder: Story = {
  args: {
    placeholder: 'Вставьте ссылку или выберите файл'
  }
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 'Файл загружается...'
  }
};

export const FileInput: Story = {
  args: {
    type: 'file',
    accept: 'audio/*,video/*'
  }
};

export const VideoUrlInput: Story = {
  args: {
    type: 'url',
    defaultValue: 'https://www.youtube.com/watch?v=tWwRAia3cs',
    placeholder: 'https://www.youtube.com/watch?v=...'
  }
};
