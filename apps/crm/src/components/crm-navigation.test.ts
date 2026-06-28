import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildVideoDetailPath,
  crmNavigationItems
} from './crm-navigation.js';

describe('crm navigation', () => {
  it('keeps videos as the first top-level menu item with page URLs', () => {
    assert.deepEqual(crmNavigationItems.map((item) => [item.id, item.href, item.label]), [
      ['videos', '/videos', 'Видео'],
      ['transcribe', '/', 'Транскрибатор'],
      ['download', '/download', 'Скачать видео'],
      ['compress', '/compress', 'Сжать видео']
    ]);
    assert.equal(crmNavigationItems.some((item) => item.href === '/history'), false);
  });

  it('builds stable video detail URLs from library ids', () => {
    assert.equal(buildVideoDetailPath('video id'), '/videos/video%20id');
  });
});
