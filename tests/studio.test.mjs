import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('Studio shell keeps native navigation/upload and shows period statistics', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('https://studio.youtube.com/**', route => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head></head><body>
        <ytcp-app><ytcp-header><ytcp-button id="create-button">Создать</ytcp-button></ytcp-header>
          <ytcp-navigation-drawer><a href="/channel/UC5-tQZ_dtoCVGtItNRy5RUQ">Канал</a><ytcp-navigation-item id="content-link">Контент</ytcp-navigation-item></ytcp-navigation-drawer>
          <main id="main-content"><ytcp-videos-page>
            <ytcp-video-row><a href="/video/12345678901/edit">Тестовый ролик</a></ytcp-video-row>
          </ytcp-videos-page></main>
        </ytcp-app></body></html>`,
    }));
    await page.goto('https://studio.youtube.com/channel/UC5-tQZ_dtoCVGtItNRy5RUQ/videos');
    await page.evaluate(() => {
      window.nativeClicks = { navigation: 0, upload: 0 };
      document.querySelector('#content-link').addEventListener('click', () => window.nativeClicks.navigation++);
      document.querySelector('#create-button').addEventListener('click', () => window.nativeClicks.upload++);
      window.chrome = {
        storage: {
          local: {
            get: async () => ({ studioEnabled: true, siteEnabled: true, statsPanelEnabled: true, preset: '7d' }),
            set: async () => {},
          },
          onChanged: { addListener: () => {} },
        },
        runtime: {
          getManifest: () => ({ oauth2: { client_id: 'test.apps.googleusercontent.com' } }),
          sendMessage: async request => ({
            ok: true,
            rows: request.report === 'videos'
              ? [{ video: '12345678901', views: request.preset === '7d' ? 136 : 1200, likes: 5, comments: 2, shares: 1 }]
              : [{ views: 136, estimatedMinutesWatched: 100, likes: 5, comments: 2, shares: 1, subscribersGained: 3 }],
          }),
        },
      };
    });
    await page.addStyleTag({ path: resolve('dist/studio.css') });
    await page.addScriptTag({ path: resolve('dist/studio.js') });
    await page.locator('.vkvk-period-badge').waitFor();
    assert.equal(await page.locator('.vkvk-back').getAttribute('href'), 'https://www.youtube.com/channel/UC5-tQZ_dtoCVGtItNRy5RUQ');
    assert.equal(await page.locator('.vkvk-back').getAttribute('data-channel-url'), 'https://www.youtube.com/channel/UC5-tQZ_dtoCVGtItNRy5RUQ');
    assert.match(await page.locator('.vkvk-period-badge').innerText(), /136/);
    await page.locator('.vkvk-menu-item[data-route="content"]').click();
    assert.equal(await page.locator('.vkvk-top-icon[title="Добавить"]').count(), 1);
    assert.ok(await page.locator('.vkvk-menu-item[data-route="overview"] svg').count());
    await page.locator('.vkvk-top-icon[title="Добавить"]').click();
    await page.locator('.vkvk-create-item').filter({ hasText: 'Загрузить видео' }).click();
    assert.deepEqual(await page.evaluate(() => window.nativeClicks), { navigation: 1, upload: 1 });
    await page.locator('.vkvk-content-controls select').selectOption('all');
    await page.waitForFunction(() => document.querySelector('.vkvk-period-badge')?.textContent?.includes('1 200'));
    await page.evaluate(() => {
      history.pushState({}, '', '/channel/UC5-tQZ_dtoCVGtItNRy5RUQ');
      document.querySelector('#main-content').innerHTML = `
        <ytcd-channel-dashboard><div id="cards">
          <ytcd-card>Аналитика канала</ytcd-card><ytcd-card>Последняя публикация</ytcd-card>
          <ytcd-card>Популярные видео</ytcd-card><ytcd-card>Недавно опубликованные</ytcd-card>
        </div></ytcd-channel-dashboard>`;
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(() => document.documentElement.dataset.vkvkRoute === 'overview');
    assert.equal(await page.locator('ytcd-channel-dashboard #cards').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 2);
    assert.ok(await page.locator('#main-content').evaluate(node => node.getBoundingClientRect().right <= innerWidth));
    await page.evaluate(() => {
      history.pushState({}, '', '/channel/UC5-tQZ_dtoCVGtItNRy5RUQ/comments');
      document.querySelector('#main-content').innerHTML = `
        <ytcp-comments>
          <ytcp-comment>
            <div id="author-thumbnail"></div>
            <div id="body"><yt-formatted-string id="comment-text">не пригото слушать такой голос</yt-formatted-string></div>
            <div id="video-thumbnail"></div>
          </ytcp-comment>
        </ytcp-comments>`;
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(() => document.documentElement.dataset.vkvkRoute === 'comments');
    assert.equal(await page.locator('ytcp-comment').evaluate(node => getComputedStyle(node).display), 'grid');
    assert.equal(await page.locator('ytcp-comment #body').evaluate(node => getComputedStyle(node).textAlign), 'left');
    assert.equal(await page.locator('#main-content > *').evaluate(node => getComputedStyle(node).marginLeft), '0px');
    await page.evaluate(() => {
      const main = document.querySelector('#main-content');
      const filler = document.createElement('div');
      filler.style.height = '2400px';
      main.append(filler);
    });
    await page.mouse.move(720, 420);
    await page.mouse.wheel(0, 500);
    await page.waitForFunction(() => document.querySelector('#main-content').scrollTop > 40);
  } finally {
    await browser.close();
  }
});
