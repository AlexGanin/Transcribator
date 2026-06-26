import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_API_BASE_URL, normalizeApiBaseUrl } from './api-base-url.js';

describe('extension API base URL helpers', () => {
  it('uses the Transcribator API port in the 2000 range by default', () => {
    assert.equal(normalizeApiBaseUrl(undefined), DEFAULT_API_BASE_URL);
    assert.equal(normalizeApiBaseUrl(' http://127.0.0.1:2001/ '), DEFAULT_API_BASE_URL);
  });

  it('migrates the previous localhost default from port 3001 to port 2001', () => {
    assert.equal(normalizeApiBaseUrl('http://127.0.0.1:3001'), DEFAULT_API_BASE_URL);
    assert.equal(normalizeApiBaseUrl('http://localhost:3001/'), DEFAULT_API_BASE_URL);
  });

  it('keeps a custom API URL', () => {
    assert.equal(normalizeApiBaseUrl('http://127.0.0.1:2101/'), 'http://127.0.0.1:2101');
  });
});
