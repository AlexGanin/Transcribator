import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.storage.local.set({ transcribatorApiBaseUrl: 'http://localhost:3001' });
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'TRANSCRIBATOR_YOUTUBE_URL' || typeof message.url !== 'string') {
      return;
    }

    void browser.storage.local.set({ transcribatorLastYouTubeUrl: message.url });
  });
});
