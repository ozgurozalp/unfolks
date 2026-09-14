import fs from 'node:fs';
import deepmerge from 'deepmerge';

const packageJson = JSON.parse(fs.readFileSync('../package.json', 'utf8'));

const isFirefox = process.env.__FIREFOX__ === 'true';

/** Chrome opens the UI in the side panel, which stays open while browsing. */
const sidePanelConfig = {
  permissions: ['sidePanel'],
  side_panel: {
    default_path: 'popup/index.html',
  },
};

/** Firefox has no side panel API, so it keeps the toolbar popup. */
const popupConfig = {
  action: {
    default_popup: 'popup/index.html',
  },
};

const instagramPages = ['https://instagram.com/*', 'https://*.instagram.com/*'];
const instagramMedia = ['https://*.cdninstagram.com/*', 'https://*.fbcdn.net/*'];

const icons = {
  16: '/icon-16.png',
  32: '/icon-32.png',
  128: '/icon-128.png',
};

/**
 * After changing, please reload the extension at `chrome://extensions`
 * @type {chrome.runtime.ManifestV3}
 */
const manifest = deepmerge(
  {
    manifest_version: 3,
    default_locale: 'en',
    name: '__MSG_extensionName__',
    version: packageJson.version,
    description: '__MSG_extensionDescription__',
    host_permissions: [...instagramPages, ...instagramMedia],
    permissions: ['storage'],
    background: {
      service_worker: 'background.iife.js',
      type: 'module',
    },
    action: {
      default_icon: icons,
    },
    icons,
    content_scripts: [
      {
        matches: instagramPages,
        js: ['content/index.iife.js'],
      },
    ],
  },
  isFirefox ? popupConfig : sidePanelConfig,
);

export default manifest;
