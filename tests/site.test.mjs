import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('YouTube shell keeps real links and follows SPA routes', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('https://www.youtube.com/**', route => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body><ytd-app><ytd-masthead><div id="avatar-btn"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAACAgP///ywAAAAAAQABAAACAUwAOw=="></div></ytd-masthead><ytd-page-manager>
        <ytd-browse page-subtype="home"><ytd-rich-grid-renderer><div id="contents"><ytd-rich-grid-media>
          <a href="/watch?v=12345678901"><img class="ytCoreImageHost" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></a>
          <a id="video-title" title="Настоящее видео">Настоящее видео</a>
          <yt-decorated-avatar-view-model><img src="data:image/gif;base64,R0lGODlhAQABAIAAAACAgP///ywAAAAAAQABAAACAUwAOw=="></yt-decorated-avatar-view-model>
          <div id="metadata-line">Автор</div><div id="metadata-line">136 просмотров</div>
        </ytd-rich-grid-media>
        <ytd-rich-section-renderer><ytd-rich-shelf-renderer><h2 id="title">Shorts</h2></ytd-rich-shelf-renderer></ytd-rich-section-renderer></div></ytd-rich-grid-renderer></ytd-browse>
      </ytd-page-manager></ytd-app></body></html>`,
    }));
    await page.goto('https://www.youtube.com/');
    await page.evaluate(() => {
      window.storageWrites = [];
      window.chrome = {
        storage: {
          local: {
            get: async () => ({ siteEnabled: true, studioEnabled: true, statsPanelEnabled: true, hideVidiq: false, sideExpanded: false, preset: '7d', vidiqCompatV1: true }),
            set: async value => { window.storageWrites.push(value); },
          },
          onChanged: { addListener: () => {} },
        },
      };
    });
    await page.addStyleTag({ path: resolve('dist/site.css') });
    await page.addScriptTag({ path: resolve('dist/site.js') });
    await page.locator('#vkvk-site-shell').waitFor();
    assert.equal(await page.locator('.vkvk-nav[data-route="home"]').getAttribute('href'), '/');
    assert.equal(await page.locator('.vkvk-nav[data-route="studio"]').getAttribute('href'), 'https://studio.youtube.com/');
    assert.ok(await page.locator('.vkvk-nav[data-route="home"] svg path').count(), 'VK icon is rendered');
    assert.equal(await page.locator('.vkvk-search input').getAttribute('placeholder'), 'Поиск видео');
    await page.locator('ytd-rich-grid-media').waitFor();
    await page.waitForFunction(() => document.querySelector('ytd-rich-shelf-renderer #title')?.textContent === 'Клипы');
    assert.equal(await page.locator('ytd-rich-grid-media a[href*="/watch"]').first().getAttribute('href'), '/watch?v=12345678901');
    assert.ok(await page.locator('ytd-rich-grid-media yt-decorated-avatar-view-model img').count(), 'native channel avatar is retained');
    assert.equal(await page.locator('.vkvk-inline-avatar').count(), 0, 'channel avatar is not duplicated');
    assert.match(await page.title(), /^VK Видео/);
    assert.equal(await page.locator('html').evaluate(node => node.classList.contains('vkvk-custom-catalog')), false);
    assert.equal(await page.locator('ytd-page-manager').evaluate(node => getComputedStyle(node).marginLeft), '280px');
    await page.evaluate(() => {
      const card = document.querySelector('ytd-rich-grid-media');
      for (let index = 0; index < 100; index++) card.append(document.createElement('span'));
    });
    await page.waitForTimeout(500);
    assert.equal(await page.locator('ytd-rich-grid-media').count(), 1);
    assert.equal(await page.locator('ytd-rich-grid-renderer').evaluate(node => getComputedStyle(node).getPropertyValue('--ytd-rich-grid-items-per-row').trim()), '4');
    await page.locator('.vkvk-profile').click();
    assert.equal(await page.locator('.vkvk-profile-menu').evaluate(node => getComputedStyle(node).zIndex), '8');
    await page.evaluate(() => {
      history.pushState({}, '', '/@РЫЖАЯМОРДА/videos');
      document.querySelector('ytd-page-manager').innerHTML = `
        <ytd-browse><yt-page-header-view-model>
          <yt-avatar-shape><img src="data:image/gif;base64,R0lGODlhAQABAIAAAACAgP///ywAAAAAAQABAAACAUwAOw=="></yt-avatar-shape>
          <div id="subscriber-count">4,12 тыс. подписчиков</div>
          <yt-subscribe-button-view-model><button>Подписаться</button></yt-subscribe-button-view-model>
        </yt-page-header-view-model><ytd-rich-grid-renderer><div id="contents"></div></ytd-rich-grid-renderer></ytd-browse>`;
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(() => document.documentElement.dataset.vkvkRoute === 'channel');
    assert.equal(await page.locator('html').evaluate(node => node.classList.contains('vkvk-custom-catalog')), false);
    assert.equal(await page.locator('.vkvk-owner-controls a').count(), 3);
    assert.match(await page.locator('#subscriber-count').innerText(), /4,12 млн/);
    assert.equal(await page.locator('yt-subscribe-button-view-model').evaluate(node => getComputedStyle(node).display), 'none');
    await page.evaluate(() => {
      history.pushState({}, '', '/feed/trending');
      document.querySelector('ytd-page-manager').innerHTML = '<ytd-browse><div id="contents"></div></ytd-browse>';
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(() => document.documentElement.dataset.vkvkRoute === 'trending');
    assert.equal(await page.locator('html').evaluate(node => node.classList.contains('vkvk-custom-catalog')), false);
    await page.evaluate(() => {
      history.pushState({}, '', '/feed/history');
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(() => document.documentElement.dataset.vkvkRoute === 'history');
    assert.equal(await page.locator('.vkvk-nav[data-route="history"]').evaluate(node => node.classList.contains('active')), true);
    await page.evaluate(() => {
      history.pushState({}, '', '/playlist?list=WL');
      document.querySelector('ytd-page-manager').innerHTML = `
        <ytd-browse page-subtype="playlist">
          <ytd-playlist-video-renderer>
            <a id="video-title" href="/watch?v=abcdefghijk" title="Отложенное">Отложенное</a>
            <yt-decorated-avatar-view-model><img src="data:image/gif;base64,R0lGODlhAQABAIAAAACAgP///ywAAAAAAQABAAACAUwAOw=="></yt-decorated-avatar-view-model>
            <div id="metadata-line">Канал</div>
          </ytd-playlist-video-renderer>
        </ytd-browse>`;
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(() => document.documentElement.dataset.vkvkRoute === 'playlist');
    assert.equal(await page.locator('.vkvk-nav[data-route="watch-later"]').evaluate(node => node.classList.contains('active')), true);
    assert.equal(await page.locator('html').evaluate(node => node.classList.contains('vkvk-custom-catalog')), false);
    assert.equal(await page.locator('ytd-playlist-video-renderer #video-title').getAttribute('href'), '/watch?v=abcdefghijk');
    await page.evaluate(() => {
      history.pushState({}, '', '/watch?v=12345678901');
      document.querySelector('ytd-page-manager').insertAdjacentHTML('beforeend', `
        <ytd-watch-flexy><div id="columns"><div id="primary"><div class="ytp-play-progress"></div>
        <button class="ytp-size-button"></button><button class="ytp-miniplayer-button"></button></div>
        <div id="secondary"><div id="secondary-inner">
          <ytd-playlist-panel-renderer style="display:block"><div id="header">Джем – тест</div><div id="items"><a href="/watch?v=98765432109">Видео</a></div></ytd-playlist-panel-renderer>
          <ytd-playlist-panel-renderer id="invalid-playlist" style="display:block">NaN / NaN</ytd-playlist-panel-renderer>
          <yt-related-chip-cloud-renderer><button role="tab"></button><button role="tab"></button><button role="tab"></button></yt-related-chip-cloud-renderer>
        </div></div></div>
        <div class="ytp-settings-menu"><div class="ytp-menuitem">Профессиональное освещение</div><div class="ytp-menuitem">Качество</div><div class="ytp-menuitem">Звуковая дорожка</div></div>
        <ytd-watch-metadata>
          <div id="owner"><a href="/@РЫЖАЯМОРДА">РЫЖАЯ МОРДА</a></div>
          <div id="owner-sub-count">4,12 тыс. подписчиков</div>
          <div id="view-count">62 просмотров</div>
          <div id="description"><button id="expand">ещё</button></div>
          <like-button-view-model><button><span class="yt-spec-button-shape-next__button-text-content">0</span></button></like-button-view-model>
          <dislike-button-view-model></dislike-button-view-model>
        </ytd-watch-metadata></ytd-watch-flexy>`);
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(() => document.documentElement.dataset.vkvkRoute === 'watch');
    assert.equal(await page.locator('ytd-watch-flexy #secondary').evaluate(node => Math.round(node.getBoundingClientRect().width)), 300);
    assert.equal(await page.locator('dislike-button-view-model').evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('.ytp-play-progress').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(38, 136, 235)');
    assert.equal(await page.locator('ytd-playlist-panel-renderer').first().evaluate(node => Math.round(node.getBoundingClientRect().height)), 286);
    assert.match(await page.locator('ytd-playlist-panel-renderer #header').first().innerText(), /^Плейлист/);
    assert.equal(await page.locator('#invalid-playlist').evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('#vkvk-recommend-heading strong').innerText(), 'Смотрите также');
    assert.ok(await page.evaluate(() => {
      const heading = document.getElementById('vkvk-recommend-heading');
      const playlist = document.querySelector('ytd-playlist-panel-renderer');
      return Boolean(heading && playlist && (playlist.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING));
    }), 'related heading stays under the playlist, not over the player');
    assert.equal(await page.locator('yt-related-chip-cloud-renderer').evaluate(node => getComputedStyle(node).display), 'flex');
    assert.match(await page.locator('#owner-sub-count').innerText(), /4,12 млн/);
    assert.match(await page.locator('.vkvk-watch-views').innerText(), /^62 тыс\. просмотров$/);
    assert.ok(await page.evaluate(() => {
      const line = document.querySelector('.vkvk-watch-views');
      const description = document.querySelector('#description');
      return Boolean(line && description && (line.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING));
    }), 'view count stays above the description');
    assert.match(await page.locator('like-button-view-model .yt-spec-button-shape-next__button-text-content').innerText(), /^\d+ тыс\.$/);
    assert.equal(await page.locator('like-button-view-model button').evaluate(node => getComputedStyle(node, '::before').content), '""');
    assert.match(await page.locator('like-button-view-model button').evaluate(node => getComputedStyle(node, '::before').webkitMaskImage || getComputedStyle(node, '::before').maskImage), /zm\.274|1\.794/);
    await page.locator('like-button-view-model button').evaluate(node => node.setAttribute('aria-pressed', 'true'));
    assert.match(await page.locator('like-button-view-model button').evaluate(node => getComputedStyle(node, '::before').webkitMaskImage || getComputedStyle(node, '::before').maskImage), /16\.266 4z/);
    assert.doesNotMatch(await page.locator('like-button-view-model button').evaluate(node => getComputedStyle(node, '::before').webkitMaskImage || getComputedStyle(node, '::before').maskImage), /zm\.274/);
    await page.evaluate(() => {
      document.querySelector('.vkvk-watch-views')?.setAttribute('data-pin', '1');
      const source = document.querySelector('#view-count');
      if (source) source.textContent = '70 просмотров';
      const host = document.createElement('like-button-view-model');
      host.id = 'shadow-like';
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<button aria-pressed="true"><span class="yt-spec-button-shape-next__button-text-content">3</span></button>';
      document.querySelector('ytd-watch-metadata')?.append(host);
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(() => document.querySelector('.vkvk-watch-views')?.textContent?.startsWith('70'));
    assert.equal(await page.locator('.vkvk-watch-views').getAttribute('data-pin'), '1');
    await page.waitForFunction(() => document.querySelector('#shadow-like')?.dataset.vkvkLiked === 'true');
    assert.match(await page.locator('#shadow-like').evaluate(node => {
      const button = node.shadowRoot?.querySelector('button');
      const style = button ? getComputedStyle(button, '::before') : null;
      return `${style?.webkitMaskImage || ''} ${style?.backgroundColor || ''} ${getComputedStyle(node, '::before').webkitMaskImage || ''}`;
    }), /16\.266 4z/);
    await page.waitForSelector('#vkvk-recsys-toast.vkvk-recsys-toast--show');
    assert.equal(await page.locator('.ytp-size-button').evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('.ytp-miniplayer-button').evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('.ytp-menuitem').first().evaluate(node => getComputedStyle(node).display), 'none');
    assert.notEqual(await page.locator('.ytp-menuitem').nth(1).evaluate(node => getComputedStyle(node).display), 'none');
    assert.notEqual(await page.locator('.ytp-menuitem').last().evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true, cancelable: true });
      return document.dispatchEvent(event);
    }), false, 'theater shortcut is blocked');
    await page.locator('.vkvk-header .vkvk-icon-button').first().click();
    assert.equal(await page.locator('html').evaluate(node => node.classList.contains('vkvk-watch-side-expanded')), true);
    assert.deepEqual(await page.evaluate(() => window.storageWrites.at(-1)), { sideExpanded: true });
    await page.evaluate(() => {
      const player = document.createElement('div');
      player.id = 'movie_player';
      player.className = 'html5-video-player ytp-fullscreen';
      document.querySelector('ytd-watch-flexy')?.append(player);
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(() => document.documentElement.classList.contains('vkvk-fullscreen'));
    assert.equal(await page.locator('#vkvk-site-shell').evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('#movie_player').evaluate(node => getComputedStyle(node).position), 'fixed');
    assert.equal(await page.locator('#movie_player').evaluate(node => getComputedStyle(node).zIndex), '2147483646');
    await page.evaluate(() => {
      history.pushState({}, '', '/shorts/12345678901');
      document.querySelector('ytd-page-manager').innerHTML = `
        <ytd-shorts><ytd-reel-video-renderer><div id="short-video-container"><div id="player-container"></div></div>
        <button-view-model><button aria-label="Ремикс"></button></button-view-model>
        <pivot-button-view-model></pivot-button-view-model></ytd-reel-video-renderer></ytd-shorts>`;
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(() => document.documentElement.dataset.vkvkRoute === 'shorts');
    assert.notEqual(await page.locator('ytd-reel-video-renderer').evaluate(node => getComputedStyle(node).visibility), 'hidden');
    assert.notEqual(await page.locator('button-view-model').evaluate(node => getComputedStyle(node).display), 'none');
    assert.notEqual(await page.locator('pivot-button-view-model').evaluate(node => getComputedStyle(node).display), 'none');
  } finally {
    await browser.close();
  }
});
