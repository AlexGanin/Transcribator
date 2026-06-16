import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    if (document.getElementById('transcribator-extension-host')) return;

    const host = document.createElement('div');
    host.id = 'transcribator-extension-host';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
      }

      .button {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        border: 0;
        border-radius: 8px;
        background: #111827;
        color: #ffffff;
        cursor: pointer;
        font: 600 13px Arial, Helvetica, sans-serif;
        padding: 10px 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      }

      .button:hover {
        background: #064e3b;
      }
    `;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button';
    button.textContent = 'Transcribator';
    button.addEventListener('click', () => {
      void browser.runtime.sendMessage({
        type: 'TRANSCRIBATOR_YOUTUBE_URL',
        url: window.location.href
      });
    });

    shadow.append(style, button);
    document.documentElement.append(host);
  }
});
