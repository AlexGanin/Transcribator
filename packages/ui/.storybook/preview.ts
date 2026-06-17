import type { Preview } from '@storybook/react-vite';
import '../src/storybook.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'workspace',
      values: [
        { name: 'workspace', value: '#f4f6f5' },
        { name: 'white', value: '#ffffff' }
      ]
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    },
    layout: 'padded'
  }
};

export default preview;
