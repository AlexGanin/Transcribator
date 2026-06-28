import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chooseNextLightboxIndex,
  getAdjacentLightboxIndex,
  getRestoredLightboxIndex,
  isLightboxDeleteKey,
  isLightboxUndoKey
} from './screenshot-lightbox-navigation.js';

describe('screenshot lightbox navigation', () => {
  it('wraps left and right keyboard navigation across available screenshots', () => {
    assert.equal(getAdjacentLightboxIndex(0, 3, 'previous'), 2);
    assert.equal(getAdjacentLightboxIndex(2, 3, 'next'), 0);
    assert.equal(getAdjacentLightboxIndex(1, 3, 'previous'), 0);
    assert.equal(getAdjacentLightboxIndex(1, 3, 'next'), 2);
  });

  it('keeps a single-image lightbox on the same item when navigating', () => {
    assert.equal(getAdjacentLightboxIndex(0, 1, 'previous'), 0);
    assert.equal(getAdjacentLightboxIndex(0, 1, 'next'), 0);
  });

  it('chooses the next available screenshot after deleting the current item', () => {
    assert.equal(chooseNextLightboxIndex(1, 4), 1);
    assert.equal(chooseNextLightboxIndex(3, 4), 2);
    assert.equal(chooseNextLightboxIndex(0, 1), null);
  });

  it('treats Mac Delete and forward Delete keys as lightbox delete shortcuts', () => {
    assert.equal(isLightboxDeleteKey('Backspace'), true);
    assert.equal(isLightboxDeleteKey('Delete'), true);
    assert.equal(isLightboxDeleteKey('ArrowLeft'), false);
  });

  it('treats command z as a lightbox undo shortcut', () => {
    assert.equal(isLightboxUndoKey('z', true), true);
    assert.equal(isLightboxUndoKey('Z', true), true);
    assert.equal(isLightboxUndoKey('x', true, 'KeyZ'), true);
    assert.equal(isLightboxUndoKey('z', false), false);
    assert.equal(isLightboxUndoKey('Backspace', true), false);
  });

  it('finds a restored screenshot index in the active gallery', () => {
    const screenshots = [
      { fileName: 'first.jpg' },
      { fileName: 'restored.jpg' },
      { fileName: 'last.jpg' }
    ];

    assert.equal(getRestoredLightboxIndex(screenshots, 'restored.jpg'), 1);
    assert.equal(getRestoredLightboxIndex(screenshots, 'missing.jpg'), null);
  });
});
