import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('watch views stay above description when YouTube puts them inside the expander', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('https://www.youtube.com/**', route => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><style>ytd-watch-metadata{display:block;width:900px;margin-left:80px}#title{display:block}#description{display:block;margin-left:120px;margin-top:-25px}</style></head><body><ytd-app><ytd-page-manager><ytd-watch-flexy>
        <ytd-watch-metadata><div id="title">Название ролика</div><ytd-watch-info-text><div id="native-views">123 просмотра</div></ytd-watch-info-text><div id="details-row" style="display:flex;flex-direction:row"><div id="description"><ytd-text-inline-expander>
          <yt-attributed-string id="inside-views">123 просмотра · 25 сент. 2026 г.</yt-attributed-string>
          <yt-attributed-string id="body-text">Это текст описания ролика. <span id="expanded-text" hidden>Дополнительное описание.</span></yt-attributed-string>
          <button id="expand" onclick="document.querySelector('#expanded-text').hidden=false">Показать ещё</button>
          <button id="collapse" onclick="document.querySelector('#expanded-text').hidden=true">Свернуть</button>
        </ytd-text-inline-expander><ytd-structured-description-content-renderer><h2>Как это было сделано</h2><yt-attributed-string id="dub-details">Звуковые дорожки на некоторых языках были созданы автоматически, и этот длинный текст не является описанием ролика.</yt-attributed-string></ytd-structured-description-content-renderer></div></div></ytd-watch-metadata>
      </ytd-watch-flexy></ytd-page-manager></ytd-app></body></html>`,
    }));
    await page.goto('https://www.youtube.com/watch?v=12345678901');
    await page.evaluate(() => {
      window.chrome = { storage: { local: { get: async () => ({ siteEnabled: true, studioEnabled: true, statsPanelEnabled: true, hideVidiq: false, sideExpanded: false, preset: '7d' }), set: async () => {} }, onChanged: { addListener: () => {} } } };
    });
    await page.addStyleTag({ path: resolve('dist/site.css') });
    await page.addScriptTag({ path: resolve('dist/site.js') });
    await page.locator('.vkvk-watch-views').waitFor();
    await page.waitForTimeout(400);
    assert.match(await page.locator('.vkvk-watch-views').innerText(), /123 просмотра · 25 сент\. 2026 г\./);
    assert.equal(await page.locator('#inside-views').evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('ytd-watch-info-text').evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('#body-text').evaluate(node => getComputedStyle(node).borderTopStyle), 'none');
    assert.equal(await page.locator('#body-text').evaluate(node => node.classList.contains('vkvk-desc-text')), true);
    assert.equal(await page.locator('#dub-details').evaluate(node => node.classList.contains('vkvk-desc-text')), false);
    assert.equal(await page.locator('#dub-details').evaluate(node => getComputedStyle(node).display), 'inline');
    assert.equal(await page.locator('#description').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(44, 45, 46)');
    assert.equal(await page.locator('#details-row').evaluate(node => getComputedStyle(node).flexDirection), 'column');
    assert.ok(await page.evaluate(() => {
      const views = document.querySelector('.vkvk-watch-views').getBoundingClientRect();
      const card = document.querySelector('#description').getBoundingClientRect();
      return views.width > 100 && views.bottom <= card.top && Math.abs(views.left - card.left) <= 2;
    }), 'views and date occupy a full row above the gray description card');
    await page.locator('.vkvk-desc-toggle').click();
    assert.equal(await page.locator('#expanded-text').evaluate(node => node.hidden), false);
    await page.evaluate(() => {
      const expander = document.querySelector('ytd-text-inline-expander');
      expander.replaceWith(expander.cloneNode(true));
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(() => document.querySelector('.vkvk-desc-toggle')?.textContent === 'Свернуть');
    await page.locator('.vkvk-desc-toggle').click();
    assert.equal(await page.locator('#expanded-text').evaluate(node => node.hidden), true);
    const alignment = await page.evaluate(() => {
      const box = document.querySelector('#description');
      const title = document.querySelector('#title');
      return { box: box.getBoundingClientRect().left, title: title.getBoundingClientRect().left, margin: getComputedStyle(box).marginLeft, aligned: box.hasAttribute('data-vkvk-desc-aligned') };
    });
    assert.ok(Math.abs(alignment.box - alignment.title) <= 2, JSON.stringify(alignment));
    assert.ok(await page.evaluate(() => {
      const line = document.querySelector('.vkvk-watch-views');
      const box = document.querySelector('#description');
      return Boolean(line && box && (line.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING));
    }));
  } finally {
    await browser.close();
  }
});

test('a video without description never gets an empty text box', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage();
    await page.route('https://www.youtube.com/**', route => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body><ytd-app><ytd-page-manager><ytd-watch-flexy><ytd-watch-metadata>
        <div id="title">Видео без описания</div><ytd-watch-info-text><div>677 тыс. просмотров</div></ytd-watch-info-text>
        <div id="description"><ytd-text-inline-expander><yt-attributed-string id="only-views">677 тыс. просмотров 5 мес. назад</yt-attributed-string></ytd-text-inline-expander></div>
      </ytd-watch-metadata></ytd-watch-flexy></ytd-page-manager></ytd-app></body></html>`,
    }));
    await page.goto('https://www.youtube.com/watch?v=abcdefghijk');
    await page.evaluate(() => {
      window.chrome = { storage: { local: { get: async () => ({ siteEnabled: true, studioEnabled: true, statsPanelEnabled: true, hideVidiq: false, sideExpanded: false, preset: '7d' }), set: async () => {} }, onChanged: { addListener: () => {} } } };
    });
    await page.addStyleTag({ path: resolve('dist/site.css') });
    await page.addScriptTag({ path: resolve('dist/site.js') });
    await page.locator('.vkvk-watch-views').waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.vkvk-desc-text').count(), 0);
    assert.equal(await page.locator('.vkvk-desc-toggle').count(), 0);
    assert.equal(await page.locator('#only-views').evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('ytd-watch-info-text').evaluate(node => getComputedStyle(node).display), 'none');
    assert.match(await page.locator('.vkvk-watch-views').innerText(), /677 тыс. просмотров/);
    assert.match(await page.locator('.vkvk-watch-views').innerText(), /5 мес. назад/);
  } finally {
    await browser.close();
  }
});
