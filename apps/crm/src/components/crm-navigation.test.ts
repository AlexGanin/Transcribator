import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildVideoDetailPath,
  buildHistoryDetailPath,
  crmNavigationItems
} from './crm-navigation.js';

describe('crm navigation', () => {
  it('keeps videos as the first top-level menu item with page URLs', () => {
    assert.deepEqual(crmNavigationItems.map((item) => [item.id, item.href, item.label]), [
      ['videos', '/videos', 'Видео'],
      ['transcribe', '/', 'Транскрибатор'],
      ['download', '/download', 'Скачать видео'],
      ['compress', '/compress', 'Сжать видео'],
      ['history', '/history', 'История']
    ]);
  });

  it('builds stable history detail URLs from entry ids', () => {
    assert.equal(buildHistoryDetailPath('abc 123'), '/history/abc%20123');
  });

  it('builds stable video detail URLs from library ids', () => {
    assert.equal(buildVideoDetailPath('video id'), '/videos/video%20id');
  });
});
