import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildObsidianMarkdown,
  formatScreenshotFileName,
  hashStringMd5
} from './obsidianNotes.js';

describe('obsidian note helpers', () => {
  it('builds stable md5 hashes for URL folder names', () => {
    assert.equal(
      hashStringMd5('https://www.youtube.com/watch?v=abc123'),
      '4da3722c21952978cba3098a9bd87808'
    );
  });

  it('formats sortable screenshot names from timestamps', () => {
    assert.equal(formatScreenshotFileName(1, 30), '0001-00-00-30.jpg');
    assert.equal(formatScreenshotFileName(2, 60), '0002-00-01-00.jpg');
    assert.equal(formatScreenshotFileName(12, 3661), '0012-01-01-01.jpg');
  });

  it('builds an Obsidian-ready Markdown transcript with embeds, metadata and only final text', () => {
    const markdown = buildObsidianMarkdown({
      title: 'Interview Recording',
      summary: 'Short summary.',
      cleanText: 'First sentence. Second sentence. Third sentence. Fourth sentence.',
      rawText: 'Raw transcript.',
      source: 'interview.mov',
      sourceType: 'file',
      engine: 'mlx-whisper',
      createdAt: '2026-06-18T06:20:44.089Z',
      videoHash: 'video-hash',
      screenshotsEnabled: true,
      screenshotIntervalSeconds: 30,
      screenshots: [
        { fileName: '0001-00-00-30.jpg', timestampSeconds: 30 },
        { fileName: '0002-00-01-00.jpg', timestampSeconds: 60 }
      ]
    });

    assert.match(markdown, /^# Interview Recording/);
    assert.match(markdown, /- Source type: `file`/);
    assert.match(markdown, /- Screenshot interval: `30 seconds`/);
    assert.match(markdown, /!\[\[screenshots\/0001-00-00-30.jpg\]\]\n\n`00:00:30`/);
    assert.match(markdown, /## Транскрипция\n\nFirst sentence\. Second sentence\. Third sentence\.\n\nFourth sentence\./);
    assert.doesNotMatch(markdown, /Clean Transcript/);
    assert.doesNotMatch(markdown, /Raw Transcript/);
    assert.doesNotMatch(markdown, /Raw transcript\./);
  });

  it('formats long punctuation-poor transcripts into readable Markdown paragraphs', () => {
    const cleanText = [
      'доброго времени суток всем кто смотрит канал сегодня у меня на столе модель которую можно использовать в трех режимах и',
      'первое что подкупает это режим тент его удобно поставить на стол и показывать презентацию',
      'второй режим это планшет клавиатура отключается и устройство можно держать как книгу',
      'третий вариант это классический ноутбук для работы с документами и браузером',
      'теперь стоит поговорить про дизайн он строгий и узнаваемый для lenovo',
      'по портам справа есть usb и слот для карты памяти слева два usb type c hdmi и аудио разъем',
      'самый интересный момент это матрица экран яркий контрастный и подходит для просмотра контента',
      'если обсуждать кому подходит данная модель она удобна дизайнерам офисным сотрудникам и тем кто часто путешествует'
    ].join(' ');

    const markdown = buildObsidianMarkdown({
      title: 'Lenovo review',
      summary: `- ${cleanText}`,
      cleanText,
      rawText: 'сырой текст не должен попадать в markdown',
      source: 'https://example.com/video',
      sourceType: 'url',
      engine: 'mlx-whisper',
      createdAt: '2026-06-18T06:20:44.089Z',
      videoHash: 'video-hash',
      screenshotsEnabled: true,
      screenshotIntervalSeconds: 30,
      screenshots: []
    });

    const transcript = markdown.split('## Транскрипция\n\n')[1]?.trim() || '';
    const paragraphs = transcript.split('\n\n');

    assert.ok(paragraphs.length >= 3);
    assert.ok(paragraphs.every((paragraph) => paragraph.length < 700));
    assert.ok(paragraphs.every((paragraph) => !/\b(а|в|для|и|на|но|по|с|что)\.$/iu.test(paragraph)));
    assert.ok(paragraphs.every((paragraph) => !/^И\s/u.test(paragraph)));
    assert.match(markdown, /Краткое содержание не сформировано отдельно/);
    assert.doesNotMatch(markdown, /сырой текст/);
    assert.doesNotMatch(markdown, /Raw Transcript/);
  });
});
