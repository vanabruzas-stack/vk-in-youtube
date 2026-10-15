import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await import('./icons.mjs');
const out = resolve('dist');
await mkdir(out, { recursive: true });
await build({
  entryPoints: {
    site: 'src/youtube-ui/site.ts',
    studio: 'src/studio-ui/studio.ts',
    background: 'src/adapters/background.ts',
    popup: 'src/popup.ts',
  },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});
await copyFile(resolve('src/youtube-ui/site.css'), resolve(out, 'site.css'));
await copyFile(resolve('src/studio-ui/studio.css'), resolve(out, 'studio.css'));
await copyFile(resolve('src/popup.css'), resolve(out, 'popup.css'));
await copyFile(resolve('src/popup.html'), resolve(out, 'popup.html'));
await copyFile(resolve('src/assets/fox-logo.jpg'), resolve(out, 'fox-logo.jpg'));
for (const size of [16, 32, 48, 128]) {
  await copyFile(resolve(`src/assets/icon${size}.png`), resolve(out, `icon${size}.png`));
}
for (const font of ['regular', 'medium', 'demibold', 'bold']) {
  await copyFile(resolve(`src/fonts/vk-sans-${font}.ttf`), resolve(out, `vk-sans-${font}.ttf`));
}
const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID || '';
if (clientId && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
  throw new Error('YOUTUBE_OAUTH_CLIENT_ID must be a Chrome extension OAuth client ID.');
}
const manifest = {
  manifest_version: 3,
  name: 'YouTube в интерфейсе VK Видео',
  description: 'Оформление YouTube и YouTube Studio по реальному интерфейсу VK Видео с сохранением функций YouTube.',
  version: '1.0.5',
  icons: { 16: 'icon16.png', 32: 'icon32.png', 48: 'icon48.png', 128: 'icon128.png' },
  action: {
    default_popup: 'popup.html',
    default_title: 'VK интерфейс YouTube',
    default_icon: { 16: 'icon16.png', 32: 'icon32.png', 48: 'icon48.png' },
  },
  permissions: ['storage', 'identity'],
  host_permissions: ['https://youtubeanalytics.googleapis.com/*'],
  ...(clientId ? { oauth2: {
    client_id: clientId,
    scopes: [
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
  } } : {}),
  background: { service_worker: 'background.js' },
  content_scripts: [
    { matches: ['https://www.youtube.com/*', 'https://youtube.com/*'], js: ['site.js'], css: ['site.css'], run_at: 'document_start' },
    { matches: ['https://studio.youtube.com/*'], js: ['studio.js'], css: ['studio.css'], run_at: 'document_start' },
  ],
  web_accessible_resources: [{
    resources: ['vk-sans-regular.ttf', 'vk-sans-medium.ttf', 'vk-sans-demibold.ttf', 'vk-sans-bold.ttf'],
    matches: ['https://www.youtube.com/*', 'https://youtube.com/*', 'https://studio.youtube.com/*'],
  }],
};
await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Built ${out}`);
