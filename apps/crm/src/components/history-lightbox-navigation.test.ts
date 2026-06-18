import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chooseNextLightboxIndex,
  getAdjacentLightboxIndex,
  isLightboxDeleteKey
} from './history-lightbox-navigation.js';

describe('history lightbox navigation', () => {
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
});
