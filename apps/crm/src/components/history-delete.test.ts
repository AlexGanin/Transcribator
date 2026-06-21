import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHistoryDeleteConfirmationMessage } from './history-delete.js';

describe('history delete helpers', () => {
  it('builds a confirmation message from a readable history title', () => {
    assert.equal(
      buildHistoryDeleteConfirmationMessage({ id: 'job-1', title: 'Интервью', source: 'https://example.com/video' }),
      'Удалить запись истории «Интервью»? Будут удалены запись, Markdown и скриншоты. Исходные загруженные медиа останутся на месте.'
    );
  });

  it('falls back to source and id when title is empty', () => {
    assert.equal(
      buildHistoryDeleteConfirmationMessage({ id: 'job-2', title: '', source: 'https://example.com/source' }),
      'Удалить запись истории «https://example.com/source»? Будут удалены запись, Markdown и скриншоты. Исходные загруженные медиа останутся на месте.'
    );
    assert.equal(
      buildHistoryDeleteConfirmationMessage({ id: 'job-3', title: '', source: '' }),
      'Удалить запись истории «job-3»? Будут удалены запись, Markdown и скриншоты. Исходные загруженные медиа останутся на месте.'
    );
  });
});
