import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './index.js';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  parameters: {
    layout: 'centered'
  },
  args: {
    children: 'Готово'
  }
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Черновик'
  }
};

export const Success: Story = {
  args: {
    variant: 'success',
    children: 'Завершено'
  }
};

export const Error: Story = {
  args: {
    variant: 'error',
    children: 'Ошибка'
  }
};

export const TranscriptionStatuses: Story = {
  render: () => (
    <div className="storybook-row">
      <Badge variant="secondary">В очереди</Badge>
      <Badge>В работе</Badge>
      <Badge variant="success">Готово</Badge>
      <Badge variant="error">Не удалось</Badge>
    </div>
  )
};
