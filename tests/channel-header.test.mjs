import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('owner channel name and description clear the avatar and share one left edge', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.route('https://www.youtube.com/**', route => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body><ytd-app><ytd-page-manager><ytd-browse><yt-page-header-view-model>
        <div class="ytPageHeaderViewModelHeadline">
          <yt-avatar-shape><img src="data:image/gif;base64,R0lGODlhAQABAIAAAACAgP///ywAAAAAAQABAAACAUwAOw=="></yt-avatar-shape>
          <div class="ytPageHeaderViewModelHeadlineInfo">
            <h1>РЫЖАЯ МОРДА</h1><div id="channel-handle">@РЫЖАЯМОРДА</div>
            <div class="yt-description-preview-view-model-wiz__description">ПОДПИШИСЬ — АДМИН ТЕБЯ НЕ ЗАБАНИТ!</div>
          </div>
        </div>
      </yt-page-header-view-model><ytd-rich-grid-renderer><div id="contents"></div></ytd-rich-grid-renderer></ytd-browse></ytd-page-manager></ytd-app></body></html>`,
    }));
    await page.goto('https://www.youtube.com/@РЫЖАЯМОРДА/videos');
    await page.evaluate(() => {
      window.chrome = { storage: { local: { get: async () => ({ siteEnabled: true, studioEnabled: true, statsPanelEnabled: true, hideVidiq: false, sideExpanded: false, preset: '7d' }), set: async () => {} }, onChanged: { addListener: () => {} } } };
    });
    await page.addStyleTag({ path: resolve('dist/site.css') });
    await page.addScriptTag({ path: resolve('dist/site.js') });
    await page.waitForFunction(() => document.documentElement.classList.contains('vkvk-owner-channel'));
    const positions = await page.evaluate(() => {
      const avatar = document.querySelector('.ytPageHeaderViewModelHeadline yt-avatar-shape').getBoundingClientRect();
      const title = document.querySelector('.ytPageHeaderViewModelHeadlineInfo h1').getBoundingClientRect();
      const description = document.querySelector('.ytPageHeaderViewModelHeadlineInfo .yt-description-preview-view-model-wiz__description').getBoundingClientRect();
      return { avatarRight: avatar.right, titleLeft: title.left, descriptionLeft: description.left };
    });
    assert.ok(positions.titleLeft >= positions.avatarRight + 16, JSON.stringify(positions));
    assert.ok(Math.abs(positions.titleLeft - positions.descriptionLeft) <= 2, JSON.stringify(positions));
  } finally {
    await browser.close();
  }
});
