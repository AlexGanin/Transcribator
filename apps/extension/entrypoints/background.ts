import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.storage.local.set({ transcribatorApiBaseUrl: 'http://127.0.0.1:2001' });
  });
});
