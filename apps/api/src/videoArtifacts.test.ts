import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createVideoArtifactsService } from './videoArtifacts.js';
import { createVideoLibraryStore } from './videoLibrary.js';

describe('video artifacts service', () => {
  it('deletes a saved video row and its runtime artifacts', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'transcribator-video-artifacts-'));
    const runtimeDir = path.join(tempDir, 'runtime');
    const sourcePath = path.join(runtimeDir, 'source', 'meeting-recording.mp4');
    const store = createVideoLibraryStore({ dbPath: path.join(tempDir, 'transcribator.sqlite') });

    try {
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, 'video', 'utf8');

      const added = store.addLocalFile({
        originalFileName: 'meeting-recording.mp4',
        sourcePath
      });
      const artifactPath = path.join(runtimeDir, 'artifacts', added.video.id, 'screenshots', 'shot-001.jpg');
      await mkdir(path.dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, 'image', 'utf8');

      const service = createVideoArtifactsService({ store, runtimeDir });
      const result = await service.deleteVideo(added.video.id);

      assert.deepEqual(result, { deletedId: added.video.id });
      assert.equal(store.getVideoById(added.video.id), null);
      await assert.rejects(access(artifactPath));
      await assert.rejects(access(sourcePath));
    } finally {
      store.close();
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});
