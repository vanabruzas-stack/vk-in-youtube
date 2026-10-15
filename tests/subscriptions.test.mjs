import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('subscriptions load channel avatars when the guide has only names', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body><ytd-app><ytd-masthead></ytd-masthead><ytd-guide-renderer><ytd-guide-entry-renderer><a href="/@SergeyOrlov" title="Сергей Орлов"></a></ytd-guide-entry-renderer></ytd-guide-renderer><ytd-page-manager></ytd-page-manager></ytd-app></body></html>' }));
    await page.route('https://www.youtube.com/feed/channels', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.route('https://www.youtube.com/@SergeyOrlov', route => route.fulfill({ contentType: 'text/html', body: '<html><script type="application/json">{"avatar":{"thumbnails":[{"url":"https://yt3.ggpht.com/channel-avatar"}]}}</script></html>' }));
    await page.route('https://yt3.ggpht.com/**', route => route.fulfill({ contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAACAgP///ywAAAAAAQABAAACAUwAOw==', 'base64') }));
    await page.goto('https://www.youtube.com/');
    await page.evaluate(() => {
      window.chrome = { storage: { local: { get: async () => ({ siteEnabled: true, studioEnabled: true, statsPanelEnabled: true, hideVidiq: false, sideExpanded: false, preset: '7d' }), set: async () => {} }, onChanged: { addListener: () => {} } } };
    });
    await page.addStyleTag({ path: resolve('dist/site.css') });
    await page.addScriptTag({ path: resolve('dist/site.js') });
    await page.locator('.vkvk-subscription img').waitFor();
    assert.equal(await page.locator('.vkvk-subscription img').getAttribute('src'), 'https://yt3.ggpht.com/channel-avatar');
  } finally {
    await browser.close();
  }
});
