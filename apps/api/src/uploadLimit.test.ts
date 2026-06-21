import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBytes, getMaxUploadSizeBytes, getMaxUploadSizeGb } from './uploadLimit.js';

describe('upload limits', () => {
  it('uses 20 GiB as the default upload size limit', () => {
    assert.equal(getMaxUploadSizeGb({}), 20);
    assert.equal(getMaxUploadSizeBytes({}), 20 * 1024 ** 3);
    assert.equal(formatBytes(getMaxUploadSizeBytes({})), '20 GiB');
  });

  it('allows a positive MAX_UPLOAD_SIZE_GB override', () => {
    assert.equal(getMaxUploadSizeGb({ MAX_UPLOAD_SIZE_GB: '12.5' }), 12.5);
    assert.equal(formatBytes(getMaxUploadSizeBytes({ MAX_UPLOAD_SIZE_GB: '12.5' })), '12.5 GiB');
  });
});
