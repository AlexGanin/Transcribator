import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHistoryDetailPath,
  crmNavigationItems
} from './crm-navigation.js';

describe('crm navigation', () => {
  it('keeps history as the last top-level menu item with page URLs', () => {
    assert.deepEqual(crmNavigationItems.map((item) => [item.id, item.href, item.label]), [
      ['transcribe', '/', 'Транскрибатор'],
      ['download', '/download', 'Скачать видео'],
      ['compress', '/compress', 'Сжать видео'],
      ['history', '/history', 'История']
    ]);
  });

  it('builds stable history detail URLs from entry ids', () => {
    assert.equal(buildHistoryDetailPath('abc 123'), '/history/abc%20123');
  });
});
