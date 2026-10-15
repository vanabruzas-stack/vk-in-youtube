import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('reverse-extension/dist');
const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'));

test('the reverse extension has its own manifest and limits permissions', () => {
  assert.equal(manifest.name, 'YouTube');
  assert.equal(manifest.version, '0.2.0');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.ok(manifest.content_scripts[0].matches.includes('https://vkvideo.ru/*'));
  assert.ok(manifest.content_scripts[1].matches.includes('https://cabinet.vkvideo.ru/*'));
});

const site = `<!doctype html><html><head><title>VK Видео</title></head><body><div id="spa_root"><div data-testid="video_spa_header"><a href="/" aria-label="На главную VK Видео"><svg></svg></a><input id="video_service_search_input" placeholder="Поиск видео"></div><a data-testid="main_menu_trends" href="/">Главная</a><a data-testid="main_menu_clips" href="/clips">Клипы</a><a data-testid="main_menu_subscribes" href="/subscriptions">Подписки</a><a data-testid="main_menu_vk_live" href="https://live.vkvideo.ru/">Стримы</a><div data-testid="grid"><div data-testid="grid-item"><div data-testid="video_card_layout"><a data-testid="video_card_thumb" href="/video-1"><img alt="Обложка"></a><button id="play">Смотреть</button></div></div></div></div><script>document.querySelector('#play').onclick=()=>document.body.dataset.played='yes'</script></body></html>`;
const watch = `<!doctype html><html><head><title>Ролик — VK Видео</title></head><body><div id="spa_root"><div data-testid="video_spa_header"><a href="/" aria-label="На главную VK Видео"><svg></svg></a></div><div class="vkit-HUubXK"><div role="button" data-testid="video_page_like_button"><span><svg class="vkuiIcon--like_outline_24"></svg></span><span>42</span></div><div data-testid="video_page_share_button">Поделиться</div></div><div data-testid="comment" id="123"><div data-testid="comment-like"><span><svg class="vkuiIcon--like_outline_16"></svg></span> 2</div></div></div><script>document.querySelector('[data-testid="video_page_like_button"]').onclick=()=>document.body.dataset.liked='yes'</script></body></html>`;
const shorts = `<!doctype html><html><head><title>Клипы для вас</title></head><body><div id="spa_root"><div data-testid="video_spa_header"><a href="/" aria-label="На главную VK Видео"><svg></svg></a></div><button data-testid="clips-controls-like-button"><svg class="vkuiIcon--like_outline_28"></svg></button><button data-testid="clips-controls-dislike-button"><svg class="vkuiIcon--thumbs_down_outline_28"></svg></button></div></body></html>`;
const studio = `<!doctype html><html><body><div id="spa_root"><div data-testid="video_spa_header"><a href="/" aria-label="На главную VK Видео"><svg></svg></a></div><a data-testid="dashboard_aside_video_main" href="/dashboard">Обзор</a><div data-testid="dashboard_header">Мой контент</div><div data-testid="video_dashboard_advanced_table"><table><thead><tr><th>Видео</th></tr></thead><tbody><tr><td>Тестовый ролик</td></tr></tbody></table></div><button id="upload">Загрузить видео</button></div><script>document.querySelector('#upload').onclick=()=>document.body.dataset.upload='opened'</script></body></html>`;
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(request.url?.startsWith('/dashboard') ? studio : request.url?.startsWith('/video-') ? watch : request.url?.startsWith('/clip-') ? shorts : site);
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });

async function newPage(path, area) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const listeners = [];
    const store = {};
    window.chrome = { storage: {
      local: {
        get(_key, callback) { const result = { vkyReverseEnabled: store.vkyReverseEnabled }; if (callback) callback(result); else return Promise.resolve(result); },
        async set(change) { const oldValue = store.vkyReverseEnabled; Object.assign(store, change); for (const fn of listeners) fn({ vkyReverseEnabled: { oldValue, newValue: store.vkyReverseEnabled } }, 'local'); },
      },
      onChanged: { addListener(fn) { listeners.push(fn); } },
    } };
    window.setSkin = async (area, enabled) => {
      const value = { ...(store.vkyReverseEnabled || {}), [area]: enabled };
      await window.chrome.storage.local.set({ vkyReverseEnabled: value });
    };
  });
  const page = await context.newPage();
  await page.goto(base + path);
  await page.addStyleTag({ path: resolve(dist, area + '.css') });
  await page.addStyleTag({ content: '[data-testid="grid"], .vkit-HUubXK, [data-testid="comment"] { margin-left: 300px; }' });
  await page.addScriptTag({ path: resolve(dist, area + '.js') });
  if (!path.endsWith('/challenge.html')) await page.locator('html.vky-' + area).waitFor();
  return { context, page };
}

test('site skin changes appearance while native actions and links work', async () => {
  const { context, page } = await newPage('/', 'site');
  try {
    assert.equal(await page.locator('.vky-brand').innerText(), 'YouTube');
    assert.equal(await page.title(), 'YouTube');
    assert.deepEqual(await page.locator('#vky-guide .vky-guide-section:first-child .vky-guide-label').allTextContents(), ['Главная', 'Shorts', 'Подписки', 'Вы', 'История']);
    assert.equal(await page.locator('#vky-guide .vky-guide-link[data-label="Трансляции"]').getAttribute('href'), 'https://live.vkvideo.ru/');
    assert.equal(await page.locator('[data-testid="main_menu_clips"]').innerText(), 'Shorts');
    assert.equal(await page.locator('[data-testid="video_card_thumb"]').getAttribute('href'), '/video-1');
    assert.equal(await page.locator('body').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(15, 15, 15)');
    await page.locator('#play').click();
    assert.equal(await page.locator('body').getAttribute('data-played'), 'yes');
    await page.evaluate(() => { document.documentElement.className = 'dark-theme'; });
    await page.locator('html.vky-site').waitFor();
    await page.evaluate(() => history.pushState({}, '', '/video-1'));
    await page.locator('html.vky-watch').waitFor();
    await page.evaluate(() => window.setSkin('site', false));
    await page.locator('html:not(.vky-site)').waitFor();
    assert.equal(await page.title(), 'VK Видео');
    assert.equal(await page.locator('#vky-guide').count(), 0);
    assert.equal(await page.locator('a[aria-label="На главную VK Видео"] > svg').evaluate(e => getComputedStyle(e).display), 'inline');
  } finally { await context.close(); }
});

test('watch reactions keep native likes and store separate local dislikes', async () => {
  const { context, page } = await newPage('/video-1', 'site');
  try {
    assert.equal(await page.locator('[data-testid="video_page_like_button"] .vky-thumb-up').count(), 1);
    assert.equal(await page.locator('[data-testid="video_page_like_button"] svg[class*="vkuiIcon--like_"]').evaluate(e => getComputedStyle(e.parentElement).display), 'none');
    await page.locator('[data-testid="video_page_like_button"]').click();
    assert.equal(await page.locator('body').getAttribute('data-liked'), 'yes');
    await page.locator('.vky-dislike').click();
    assert.equal(await page.locator('.vky-dislike').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('body').getAttribute('data-liked'), 'yes');
    assert.equal(await page.locator('.vky-comment-dislike').count(), 1);
    await page.evaluate(() => window.setSkin('site', false));
    await page.locator('html:not(.vky-site)').waitFor();
    assert.equal(await page.locator('.vky-dislike').count(), 0);
  } finally { await context.close(); }
});

test('Shorts route keeps the native controls and uses thumb artwork', async () => {
  const { context, page } = await newPage('/clip-1', 'site');
  try {
    assert.equal(await page.title(), 'Shorts для вас — YouTube');
    assert.equal(await page.locator('#vky-guide').getAttribute('data-collapsed'), 'true');
    assert.equal(await page.locator('[data-testid="clips-controls-like-button"] .vky-thumb-up').count(), 1);
    assert.equal(await page.locator('[data-testid="clips-controls-dislike-button"] svg').count(), 1);
    assert.ok((await page.locator('html').getAttribute('class')).includes('vky-clips'));
  } finally { await context.close(); }
});

test('robot verification page keeps its original appearance', async () => {
  const { context, page } = await newPage('/challenge.html', 'site');
  try {
    assert.equal(await page.locator('html.vky-site').count(), 0);
    assert.equal(await page.locator('.vky-brand').count(), 0);
  } finally { await context.close(); }
});

test('studio skin leaves content table and upload action usable', async () => {
  const { context, page } = await newPage('/dashboard?section=video_my_content', 'studio');
  try {
    assert.equal(await page.locator('.vky-brand').innerText(), 'YouTube Studio');
    assert.equal(await page.locator('[data-testid="dashboard_aside_video_main"]').innerText(), 'Панель управления');
    assert.equal(await page.locator('[data-testid="dashboard_aside_video_main"] .vky-studio-icon').count(), 1);
    assert.equal(await page.locator('table td').innerText(), 'Тестовый ролик');
    await page.locator('#upload').click();
    assert.equal(await page.locator('body').getAttribute('data-upload'), 'opened');
    assert.ok((await page.locator('html').getAttribute('class')).includes('vky-content'));
  } finally { await context.close(); }
});

test.after(async () => { await browser.close(); await new Promise(resolveClose => server.close(resolveClose)); });
