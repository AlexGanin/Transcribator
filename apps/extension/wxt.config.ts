import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Transcribator',
    description: 'Local helper for sending YouTube pages to the Transcribator API.',
    version: '1.0.0',
    permissions: ['activeTab', 'storage', 'tabs'],
    host_permissions: ['http://127.0.0.1:2001/*', '*://*.youtube.com/*'],
    action: {
      default_title: 'Transcribator'
    }
  }
});
