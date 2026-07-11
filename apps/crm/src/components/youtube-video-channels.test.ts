import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALL_YOUTUBE_CHANNELS_ID,
  DEFAULT_TRANSCRIPTION_SOURCE_ID,
  DEFAULT_TRANSCRIPTION_SOURCE_LABEL,
  UNCATEGORIZED_YOUTUBE_CHANNEL_ID,
  buildYouTubeChannelFilters,
  filterYouTubeVideosByChannel
} from './youtube-video-channels.js';

describe('YouTube video channel filters', () => {
  it('builds channel filters with counts from channel title, uploader and uncategorized videos', () => {
    const videos = [
      { id: '1', channelTitle: ' Канал A ', uploader: '' },
      { id: '2', channelTitle: 'Канал A', uploader: '' },
      { id: '3', channelTitle: '', uploader: 'Автор B' },
      { id: '4', channelTitle: '', uploader: '' }
    ];

    assert.deepEqual(buildYouTubeChannelFilters(videos), [
      { id: ALL_YOUTUBE_CHANNELS_ID, label: 'Все видео', count: 4 },
      { id: 'канал a', label: 'Канал A', count: 2 },
      { id: 'автор b', label: 'Автор B', count: 1 },
      { id: UNCATEGORIZED_YOUTUBE_CHANNEL_ID, label: 'Без канала', count: 1 }
    ]);
  });

  it('filters videos by selected channel id and keeps all videos for the all filter', () => {
    const videos = [
      { id: '1', channelTitle: 'Канал A', uploader: '' },
      { id: '2', channelTitle: 'Канал B', uploader: '' },
      { id: '3', channelTitle: '', uploader: '' }
    ];

    assert.deepEqual(filterYouTubeVideosByChannel(videos, ALL_YOUTUBE_CHANNELS_ID).map((video) => video.id), ['1', '2', '3']);
    assert.deepEqual(filterYouTubeVideosByChannel(videos, 'канал b').map((video) => video.id), ['2']);
    assert.deepEqual(filterYouTubeVideosByChannel(videos, UNCATEGORIZED_YOUTUBE_CHANNEL_ID).map((video) => video.id), ['3']);
  });

  it('groups local files without a manual source under the default transcriptions source', () => {
    const videos = [
      { id: '1', sourceType: 'file' as const, channelTitle: '', uploader: '' },
      { id: '2', sourceType: 'file' as const, channelTitle: 'Интервью', uploader: '' },
      { id: '3', sourceType: 'youtube' as const, channelTitle: '', uploader: '' }
    ];

    const filters = buildYouTubeChannelFilters(videos);

    assert.deepEqual(filters[0], { id: ALL_YOUTUBE_CHANNELS_ID, label: 'Все видео', count: 3 });
    assert.ok(filters.some((filter) => filter.id === DEFAULT_TRANSCRIPTION_SOURCE_ID && filter.label === DEFAULT_TRANSCRIPTION_SOURCE_LABEL && filter.count === 1));
    assert.ok(filters.some((filter) => filter.id === 'интервью' && filter.label === 'Интервью' && filter.count === 1));
    assert.ok(filters.some((filter) => filter.id === UNCATEGORIZED_YOUTUBE_CHANNEL_ID && filter.label === 'Без канала' && filter.count === 1));
  });
});
