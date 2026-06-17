import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../button/index.js';
import { Input } from '../input/index.js';
import { Textarea } from '../textarea/index.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './index.js';

const meta: Meta = {
  title: 'UI/Tabs',
  parameters: {
    layout: 'centered'
  }
};

export default meta;

type Story = StoryObj<typeof meta>;

export const TranscribatorAndDownloadVideo: Story = {
  render: () => (
    <Tabs className="w-[620px]" defaultValue="transcription">
      <TabsList>
        <TabsTrigger value="transcription">Транскрибатор</TabsTrigger>
        <TabsTrigger value="download">Скачать видео</TabsTrigger>
      </TabsList>
      <TabsContent className="grid gap-4" value="transcription">
        <Input type="file" />
        <Textarea placeholder="Здесь появится распознанный текст" />
        <Button>Начать транскрибацию</Button>
      </TabsContent>
      <TabsContent className="grid gap-4" value="download">
        <Input defaultValue="https://www.youtube.com/watch?v=tWwRAia3cs" type="url" />
        <Button>Получить варианты</Button>
      </TabsContent>
    </Tabs>
  )
};
