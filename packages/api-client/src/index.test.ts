import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApiClient, type FetchLike } from './index.js';

describe('api client defaults', () => {
  it('uses the Transcribator API port in the 2000 range by default', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };

    await createApiClient({ fetchImpl }).health();

    assert.deepEqual(requestedUrls, ['http://127.0.0.1:2001/health']);
  });
});
