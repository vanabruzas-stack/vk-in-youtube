import { applyVidiqVisibility, formatMetric, periodLabel, preferences, studioRoute, type Preferences, type Preset } from '../adapters/shared';
import { vkMarkSvg, vkStudioIcon } from '../vk-design-system/icons';
import { vkColors } from '../vk-design-system/palette';
import { vkIcons, type VkIconName } from '../vk-design-system/vk-icons.generated';

type MetricRow = Record<string, string | number>;
type AnalyticsReply = { ok: boolean; rows?: MetricRow[]; error?: string };
const labels: Record<string, string> = {
  overview: 'Обзор', content: 'Мой контент', analytics: 'Аналитика', comments: 'Комментарии',
  monetization: 'Монетизация', settings: 'Настройки', 'video-edit': 'Редактировать', 'video-analytics': 'Аналитика видео',
};
const nativeWords: Record<string, RegExp> = {
  overview: /dashboard|главная|обзор/i,
  content: /content|контент|видео/i,
  analytics: /analytics|аналитика/i,
  comments: /comments|комментарии/i,
  monetization: /earn|монетизация|доход/i,
  settings: /customization|настройки|оформление/i,
};
let state: Preferences | null = null;
let shell: HTMLElement | null = null;
let contentControl: HTMLElement | null = null;
let lastRoute = '';
let lastAnalyticsKey = '';
let scheduled = false;
let panelOpen = false;
const cache = new Map<string, MetricRow[]>();

function syncTabBrand(): void {
  const title = 'Кабинет автора — VK Видео';
  if (document.title !== title) document.title = title;
  let icon = document.querySelector<HTMLLinkElement>('link#vkvk-favicon');
  if (!icon) {
    icon = document.createElement('link');
    icon.id = 'vkvk-favicon';
    icon.rel = 'icon';
    document.head?.append(icon);
  }
  icon.href = `data:image/svg+xml,${encodeURIComponent(vkMarkSvg)}`;
}

function installFonts(): void {
  if (document.getElementById('vkvk-local-fonts')) return;
  const style = document.createElement('style');
  style.id = 'vkvk-local-fonts';
  style.textContent = [
    [400, 'vk-sans-regular.ttf'],
    [500, 'vk-sans-medium.ttf'],
    [600, 'vk-sans-demibold.ttf'],
    [700, 'vk-sans-bold.ttf'],
  ].map(([weight, file]) =>
    `@font-face{font-family:VKLocal;src:url("${chrome.runtime?.getURL?.(String(file)) || String(file)}") format("truetype");font-style:normal;font-weight:${weight};font-display:swap}`
  ).join('');
  (document.head || document.documentElement).append(style);
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', content = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = content;
  return el;
}
function nativeNavigate(route: string): void {
  const items = [...document.querySelectorAll<HTMLElement>('ytcp-navigation-item,ytcp-navigation-drawer a[href]')]
    .filter(el => !el.closest('#vkvk-studio-shell') && nativeWords[route]?.test(el.textContent?.trim() || ''));
  const match = items.find(el => el.tagName.toLowerCase() === 'ytcp-navigation-item') || items[0];
  if (match) { match.click(); return; }
  const channel = location.pathname.match(/\/channel\/[^/]+/)?.[0] || '';
  const fallback: Record<string, string> = {
    overview: channel, content: `${channel}/videos`, analytics: `${channel}/analytics`,
    comments: `${channel}/comments`, monetization: `${channel}/monetization`, settings: `${channel}/customization`,
  };
  if (fallback[route] && fallback[route] !== location.pathname) location.assign(fallback[route]);
}
function icon(name: string): string {
  return vkStudioIcon(name) || vkIcons[name as VkIconName] || vkIcons.overview;
}
function analyticsConfigured(): boolean {
  return Boolean(chrome.runtime.getManifest?.().oauth2?.client_id);
}
function nativeClick(selector: string): boolean {
  const target = [...document.querySelectorAll<HTMLElement>(selector)].find(el => !el.closest('#vkvk-studio-shell'));
  target?.click();
  return Boolean(target);
}
function triggerCreate(label: RegExp): void {
  nativeClick('ytcp-button#create-icon,ytcp-button#create-button,#create-icon,ytcp-header [aria-label*="Create"],ytcp-header [aria-label*="Создать"]');
  window.setTimeout(() => {
    const item = [...document.querySelectorAll<HTMLElement>(
      'tp-yt-paper-item,ytcp-text-menu tp-yt-paper-item,[role="menuitem"]'
    )].find(el => !el.closest('#vkvk-studio-shell') && label.test(el.textContent?.trim() || ''));
    item?.click();
  }, 120);
}
function renderShell(): void {
  if (!document.body || !document.querySelector('ytcp-app') || !state?.studioEnabled || shell) return;
  shell = node('div', 'vkvk-shell');
  shell.id = 'vkvk-studio-shell';
  const top = node('header', 'vkvk-top');
  const burger = node('button', 'vkvk-top-icon');
  burger.innerHTML = vkIcons.menu;
  burger.setAttribute('aria-label', 'Меню');
  burger.addEventListener('click', () => document.documentElement.classList.toggle('vkvk-studio-collapsed'));
  const logo = node('button', 'vkvk-logo');
  logo.innerHTML = `${vkMarkSvg}<strong>Кабинет автора</strong>`;
  logo.addEventListener('click', () => nativeNavigate('overview'));
  top.append(burger, logo);
  const actions = node('div', 'vkvk-top-actions');
  const creators = node('a', 'vkvk-creators-link', 'VK Видео для авторов');
  creators.setAttribute('href', 'https://www.youtube.com/creators/');
  creators.setAttribute('target', '_blank');
  const add = node('button', 'vkvk-top-icon');
  add.innerHTML = vkIcons.add;
  add.title = 'Добавить';
  add.addEventListener('click', event => {
    event.stopPropagation();
    shell?.querySelector<HTMLElement>('.vkvk-create-menu')?.toggleAttribute('hidden');
  });
  const bell = node('button', 'vkvk-top-icon');
  bell.innerHTML = vkIcons.bell;
  bell.title = 'Уведомления';
  bell.addEventListener('click', () => { nativeClick('ytcp-header #notifications-button,ytcp-header ytcp-notifications-button button,ytcp-header [aria-label*="Уведомл"],ytcp-header [aria-label*="Notif"]'); });
  const profile = node('button', 'vkvk-top-profile');
  profile.innerHTML = `<span class="vkvk-avatar"></span>${vkIcons.chevronDown}`;
  profile.addEventListener('click', () => { nativeClick('ytcp-header #avatar-btn,ytcp-header ytcp-account-avatar button,ytcp-header #account-button'); });
  actions.append(creators, node('span', 'vkvk-top-separator'));
  if (analyticsConfigured()) {
    const statsButton = node('button', 'vkvk-top-action', 'Статистика');
    statsButton.addEventListener('click', () => { panelOpen = !panelOpen; renderPanel(); });
    actions.append(statsButton);
  }
  actions.append(add, bell, profile);
  top.append(actions);
  const createMenu = node('div', 'vkvk-create-menu');
  createMenu.hidden = true;
  const createItems: Array<[VkIconName, string, RegExp | string]> = [
    ['content', 'Загрузить видео', /upload|загруз/i],
    ['clips', 'Создать клип', /short|корот|клип/i],
    ['live', 'Начать трансляцию', /live|эфир|трансляц/i],
    ['education', 'VK Видео для авторов', 'https://www.youtube.com/creators/'],
  ];
  for (const [iconName, text, action] of createItems) {
    const item = node(typeof action === 'string' ? 'a' : 'button', 'vkvk-create-item') as HTMLElement;
    item.innerHTML = `${vkIcons[iconName]}<span>${text}</span>`;
    if (typeof action === 'string') {
      (item as HTMLAnchorElement).href = action;
      (item as HTMLAnchorElement).target = '_blank';
    } else item.addEventListener('click', () => { createMenu.hidden = true; triggerCreate(action); });
    createMenu.append(item);
  }
  top.append(createMenu);
  const side = node('nav', 'vkvk-side');
  const back = node('a', 'vkvk-back');
  back.innerHTML = `${vkIcons.back}<span>Перейти в канал</span>`;
  back.href = 'https://www.youtube.com/';
  back.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(back.dataset.channelUrl || back.href);
  });
  side.append(back);
  const channel = node('div', 'vkvk-channel');
  channel.innerHTML = `<span class="vkvk-avatar vkvk-channel-avatar"></span><span class="vkvk-channel-text"><strong>Мой канал</strong><small>Ваш канал</small></span>${vkIcons.chevronDown}`;
  channel.addEventListener('click', () => window.location.assign(back.dataset.channelUrl || back.href));
  side.append(channel);
  const videoContext = node('div', 'vkvk-video-context');
  videoContext.hidden = true;
  side.append(videoContext);
  const menu = node('div', 'vkvk-menu');
  for (const [route, label] of Object.entries(labels).filter(([key]) => !key.startsWith('video-'))) {
    const item = node('button', 'vkvk-menu-item');
    item.dataset.route = route;
    item.innerHTML = icon(route) + `<span>${label}</span>`;
    item.addEventListener('click', () => nativeNavigate(route));
    menu.append(item);
  }
  const payouts = node('a', 'vkvk-menu-item');
  payouts.innerHTML = icon('wallet') + '<span>Кабинет выплат</span>';
  payouts.setAttribute('href', 'https://www.google.com/adsense/');
  payouts.setAttribute('target', '_blank');
  menu.append(payouts);
  side.append(menu);
  const help = node('a', 'vkvk-help');
  help.innerHTML = icon('help') + '<span>Помощь</span>';
  help.href = 'https://support.google.com/youtube/';
  help.target = '_blank';
  side.append(help);
  const panel = node('aside', 'vkvk-stats-panel');
  panel.id = 'vkvk-stats-panel';
  shell.append(top, side, panel);
  document.documentElement.append(shell);
  document.addEventListener('click', () => {
    const menu = shell?.querySelector<HTMLElement>('.vkvk-create-menu');
    if (menu) menu.hidden = true;
  });
  document.documentElement.classList.add('vkvk-studio');
  refresh();
}
function renderPanel(): void {
  const panel = shell?.querySelector<HTMLElement>('#vkvk-stats-panel');
  if (!panel || !state) return;
  panel.replaceChildren();
  panel.classList.toggle('open', panelOpen && state.statsPanelEnabled);
  if (!panelOpen || !state.statsPanelEnabled) return;
  const head = node('div', 'vkvk-panel-head');
  head.append(node('strong', '', studioRoute(location.pathname) === 'video-analytics' ? 'Статистика видео' : 'Статистика канала'));
  const close = node('button', '', '×');
  close.addEventListener('click', () => { panelOpen = false; renderPanel(); });
  head.append(close);
  const select = node('select', 'vkvk-period-select');
  for (const preset of ['7d', '30d', 'all'] as Preset[]) {
    const option = node('option', '', periodLabel[preset]);
    option.value = preset;
    select.append(option);
  }
  select.value = state.preset;
  select.addEventListener('change', () => void setPreset(select.value as Preset));
  const body = node('div', 'vkvk-panel-body', 'Загрузка статистики…');
  panel.append(head, select, body);
  void loadPanelMetrics(body);
}
async function loadPanelMetrics(target: HTMLElement): Promise<void> {
  if (!state) return;
  const preset = state.preset;
  const videoId = studioRoute(location.pathname) === 'video-analytics' ? location.pathname.match(/\/video\/([A-Za-z0-9_-]{11})/)?.[1] : undefined;
  const response = await chrome.runtime.sendMessage({ type: 'analytics', report: 'summary', preset, videoId }) as AnalyticsReply;
  if (!target.isConnected || state?.preset !== preset) return;
  target.replaceChildren();
  if (!response.ok) {
    target.append(node('p', 'vkvk-unavailable', response.error || 'Нет доступа к статистике.'));
    target.append(node('p', 'vkvk-muted', 'Подключите YouTube Analytics в настройках расширения.'));
    return;
  }
  const row = response.rows?.[0];
  if (!row) { target.append(node('p', 'vkvk-unavailable', 'За этот период данных нет.')); return; }
  const metrics: Array<[string, string]> = [
    ['views', 'Просмотры'], ['estimatedMinutesWatched', 'Минуты просмотра'],
    ['subscribersGained', 'Подписчики'], ['likes', 'Лайки'], ['comments', 'Комментарии'], ['shares', 'Поделились'],
  ];
  for (const [key, label] of metrics) {
    const box = node('div', 'vkvk-metric');
    box.append(node('strong', '', formatMetric(Number(row[key]))), node('span', '', label));
    target.append(box);
  }
  const foot = node('p', 'vkvk-muted', 'Данные YouTube Analytics могут поступать с задержкой.');
  target.append(foot);
  void loadPanelChart(target, preset, videoId);
}
async function loadPanelChart(target: HTMLElement, preset: Preset, videoId?: string): Promise<void> {
  const result = await chrome.runtime.sendMessage({ type: 'analytics', report: 'daily', preset, videoId }) as AnalyticsReply;
  if (!target.isConnected || state?.preset !== preset || !result.ok || !result.rows?.length) return;
  const values = result.rows.map(row => Number(row.views) || 0);
  const maximum = Math.max(1, ...values);
  const points = values.map((value, index) => `${8 + (index * 264) / Math.max(1, values.length - 1)},${92 - (value * 78) / maximum}`).join(' ');
  const chart = node('div', 'vkvk-chart');
  chart.append(node('strong', '', 'Просмотры по дням'));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 280 100');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'График просмотров по дням');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', points);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', vkColors.accent);
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linejoin', 'round');
  svg.append(line);
  chart.append(svg);
  chart.append(node('span', 'vkvk-muted', `${result.rows[0].day} — ${result.rows[result.rows.length - 1].day}`));
  target.append(chart);
}
async function setPreset(value: Preset): Promise<void> {
  if (!state) return;
  state.preset = value;
  await chrome.storage.local.set({ preset: value });
  lastAnalyticsKey = '';
  renderPanel();
  refreshContentControls();
}
function refreshContentControls(): void {
  if (!state || studioRoute(location.pathname) !== 'content' || !analyticsConfigured()) {
    contentControl?.remove(); contentControl = null; return;
  }
  const host = document.querySelector<HTMLElement>('ytcp-videos-page,ytcp-content-section,ytcp-app #main-content');
  if (!host) return;
  if (!contentControl || !contentControl.isConnected) {
    contentControl = node('div', 'vkvk-content-controls');
    contentControl.id = 'vkvk-content-controls';
    host.prepend(contentControl);
  }
  contentControl.replaceChildren(node('strong', '', 'Мой контент'));
  const select = node('select', 'vkvk-period-select');
  for (const preset of ['7d', '30d', 'all'] as Preset[]) {
    const option = node('option', '', periodLabel[preset]);
    option.value = preset;
    select.append(option);
  }
  select.value = state.preset;
  select.addEventListener('change', () => void setPreset(select.value as Preset));
  contentControl.append(select, node('span', 'vkvk-content-status', ''));
  void loadVideoMetrics();
}
function videoId(row: Element): string | null {
  for (const attribute of ['video-id', 'data-video-id']) {
    const value = row.getAttribute(attribute);
    if (value && /^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  }
  const hrefs = [...row.querySelectorAll<HTMLAnchorElement>('a[href]')].map(a => a.getAttribute('href') || '');
  for (const href of hrefs) {
    const match = href.match(/\/video\/([A-Za-z0-9_-]{11})/) || href.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (match) return match[1];
  }
  return null;
}
function setBadge(row: Element, label: string): void {
  let badge = row.querySelector<HTMLElement>('.vkvk-period-badge');
  if (!badge) {
    badge = node('div', 'vkvk-period-badge');
    const title = row.querySelector('a[href*="/video/"],a[href*="watch?v="],#video-title,.video-title');
    (title?.parentElement || row).append(badge);
  }
  if (badge.textContent !== label) badge.textContent = label;
}
async function loadVideoMetrics(): Promise<void> {
  if (!state || !contentControl?.isConnected) return;
  const preset = state.preset;
  const ids = [...new Set([...document.querySelectorAll('ytcp-video-row,ytcp-video-list-row')]
    .map(videoId).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const key = `videos:${preset}:${ids.join(',')}`;
  if (lastAnalyticsKey === key) {
    if (cache.has(key)) applyVideoMetrics(cache.get(key) || [], preset);
    return;
  }
  lastAnalyticsKey = key;
  const status = contentControl.querySelector<HTMLElement>('.vkvk-content-status');
  if (status) status.textContent = 'Загрузка показателей за период…';
  const response = await chrome.runtime.sendMessage({ type: 'analytics', report: 'videos', preset, videoIds: ids }) as AnalyticsReply;
  if (state?.preset !== preset || !contentControl?.isConnected) return;
  if (!response.ok) {
    if (status) status.textContent = 'Статистика за период недоступна. Накопленные счётчики YouTube сохранены.';
    document.querySelectorAll('.vkvk-period-badge').forEach(el => el.remove());
    return;
  }
  const rows = response.rows || [];
  cache.set(key, rows);
  if (status) status.textContent = `${periodLabel[preset]} · YouTube Analytics`;
  applyVideoMetrics(rows, preset);
}
function applyVideoMetrics(metrics: MetricRow[], preset: Preset): void {
  const byVideo = new Map(metrics.map(item => [String(item.video), item]));
  const rows = document.querySelectorAll('ytcp-video-row,ytcp-video-list-row');
  for (const row of rows) {
    const id = videoId(row);
    if (!id) continue;
    const data = byVideo.get(id);
    const number = (key: string) => formatMetric(data ? Number(data[key] || 0) : 0);
    setBadge(row, `${periodLabel[preset]} · просмотры ${number('views')} · лайки ${number('likes')} · комментарии ${number('comments')} · репосты ${number('shares')}`);
  }
}
function hasVisibleDialog(): boolean {
  return [...document.querySelectorAll<HTMLElement>('ytcp-uploads-dialog,[role="dialog"]')]
    .some(el => !el.closest('#vkvk-studio-shell') && el.getBoundingClientRect().width > 100 && getComputedStyle(el).visibility !== 'hidden');
}
function refreshVideoContext(route: string): void {
  const context = shell?.querySelector<HTMLElement>('.vkvk-video-context');
  const channel = shell?.querySelector<HTMLElement>('.vkvk-channel');
  if (!context || !channel) return;
  const isVideo = route === 'video-edit' || route === 'video-analytics';
  context.hidden = !isVideo;
  channel.hidden = isVideo;
  if (!isVideo) return;
  const title = document.querySelector<HTMLElement>(
    'ytcp-video-metadata-editor #title-textarea,ytcp-video-details #title,ytcp-analytics-video-title,.video-title'
  )?.textContent?.trim() || 'Видео';
  const image = document.querySelector<HTMLImageElement>(
    'ytcp-video-metadata-editor img,ytcp-video-details img,ytcp-analytics-video-thumbnail img'
  )?.src;
  context.replaceChildren();
  const back = node('button', 'vkvk-video-back', '←  Назад к контенту');
  back.addEventListener('click', () => nativeNavigate('content'));
  context.append(back);
  if (image) {
    const thumbnail = node('img', 'vkvk-video-thumb');
    thumbnail.src = image;
    thumbnail.alt = '';
    context.append(thumbnail);
  }
  context.append(node('strong', 'vkvk-video-title', title));
}
function syncChannel(): void {
  if (!shell) return;
  const drawer = 'ytcp-navigation-drawer';
  const name = document.querySelector<HTMLElement>(`${drawer} #entity-name,${drawer} .entity-name,${drawer} #channel-name,${drawer} #account-name`)?.textContent?.trim();
  const title = shell.querySelector<HTMLElement>('.vkvk-channel-text strong');
  if (title && name && title.textContent !== name) title.textContent = name;
  const channelAvatar = document.querySelector<HTMLImageElement>(`${drawer} #img-avatar img,${drawer} ytcp-thumbnail img,${drawer} img`)?.src;
  const headerAvatar = document.querySelector<HTMLImageElement>('ytcp-header #avatar-btn img,ytcp-header img#img')?.src || channelAvatar;
  const paint = (selector: string, src?: string) => shell?.querySelectorAll<HTMLElement>(selector).forEach(el => {
    const value = src ? `url("${src}")` : '';
    if (el.style.backgroundImage !== value) el.style.backgroundImage = value;
  });
  paint('.vkvk-channel-avatar', channelAvatar);
  paint('.vkvk-top-profile .vkvk-avatar', headerAvatar);
  const nativeLink = document.querySelector<HTMLAnchorElement>(
    `${drawer} a[href*="youtube.com/channel/"],${drawer} a[href*="youtube.com/@"],${drawer} a[href^="/channel/"],${drawer} a[href^="/@"]`
  )?.getAttribute('href') || '';
  let link = '';
  if (nativeLink) {
    try {
      const parsed = new URL(nativeLink, 'https://www.youtube.com/');
      if (/^\/(?:channel\/|@)/.test(parsed.pathname)) link = `https://www.youtube.com${parsed.pathname}${parsed.search}`;
    } catch {}
  }
  const channelId = location.pathname.match(/\/channel\/(UC[\w-]+)/)?.[1];
  if (!link && channelId) link = `https://www.youtube.com/channel/${channelId}`;
  const back = shell.querySelector<HTMLAnchorElement>('.vkvk-back');
  if (back && link) {
    back.dataset.channelUrl = link;
    if (back.href !== link) back.href = link;
  }
}
function alignStudioSurface(): void {
  const side = document.querySelector('.vkvk-side');
  const edge = Math.max(240, Math.round(side?.getBoundingClientRect().right || 272));
  const surfaceSelector = '#main-content, #content, ytcp-entity-page';
  document.querySelectorAll<HTMLElement>(surfaceSelector).forEach(root => {
    const isSurface = Boolean(root.closest('ytcp-app'))
      && !root.closest('#vkvk-studio-shell,[role="dialog"],ytcp-dialog,tp-yt-paper-dialog,ytcp-uploads-dialog')
      && !root.parentElement?.closest(surfaceSelector);
    root.classList.toggle('vkvk-studio-surface', isSurface);
    if (!isSurface) return;
    root.style.setProperty('margin-left', '0', 'important');
    root.style.setProperty('width', `calc(100% - ${edge}px)`, 'important');
    root.style.setProperty('max-width', 'none', 'important');
    root.style.setProperty('position', 'relative', 'important');
    root.style.setProperty('left', `${edge}px`, 'important');
    root.style.setProperty('overflow-x', 'hidden', 'important');
    root.style.setProperty('overflow-y', 'auto', 'important');
    root.style.setProperty('height', '100vh', 'important');
    root.style.setProperty('max-height', '100vh', 'important');
    root.style.setProperty('box-sizing', 'border-box', 'important');
  });
  document.querySelectorAll<HTMLElement>('ytcp-video-row, ytcp-video-list-row').forEach(row => {
    row.style.setProperty('padding-left', '8px', 'important');
    row.style.setProperty('overflow', 'visible', 'important');
    row.querySelectorAll<HTMLElement>('#video-title, .video-title, #title').forEach(title => {
      title.style.setProperty('position', 'relative', 'important');
      title.style.setProperty('left', '0', 'important');
      title.style.setProperty('transform', 'none', 'important');
      title.style.setProperty('margin-left', '8px', 'important');
      title.style.setProperty('text-indent', '0', 'important');
    });
  });
  document.querySelectorAll<HTMLElement>('ytcd-card, ytcp-dashboard-card').forEach(card => {
    card.style.setProperty('overflow', 'hidden', 'important');
    card.style.setProperty('position', 'relative', 'important');
  });
  const layoutProps = ['display', 'flex-direction', 'align-items', 'justify-content', 'justify-items', 'gap', 'width', 'max-width', 'grid-template-columns', 'position', 'left', 'order', 'flex', 'margin', 'grid-column', 'grid-row'];
  document.querySelectorAll<HTMLElement>('ytcp-comment-thread, ytcp-comment').forEach(node => {
    layoutProps.forEach(prop => node.style.removeProperty(prop));
    node.querySelectorAll<HTMLElement>('#author-thumbnail, #body, #main, #comment-content, .comment-content, #video-thumbnail, .video-thumbnail, ytcp-video-thumbnail').forEach(child => {
      layoutProps.forEach(prop => child.style.removeProperty(prop));
    });
  });
}
function refresh(): void {
  if (!state?.studioEnabled || !document.body) return;
  syncTabBrand();
  if (!shell) { renderShell(); return; }
  const route = studioRoute(location.pathname);
  syncChannel();
  document.documentElement.dataset.vkvkRoute = route;
  if (shell) {
    if (shell.parentElement !== document.documentElement) document.documentElement.append(shell);
    shell.style.setProperty('left', '0px', 'important');
    shell.style.setProperty('transform', 'none', 'important');
  }
  document.documentElement.classList.toggle('vkvk-modal-open', hasVisibleDialog());
  alignStudioSurface();
  refreshVideoContext(route);
  if (route === 'overview') {
    document.querySelectorAll<HTMLElement>('ytcd-card,ytcp-card,ytcp-dashboard-card').forEach(card => {
      if (card.closest('#vkvk-studio-shell')) return;
      const title = card.querySelector('h1,h2,h3,#title,.card-title,#card-title')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const comments = /^комментар/i.test(title) || Boolean(card.querySelector('ytcp-comment,ytcp-comments,ytcp-comment-thread'));
      card.toggleAttribute('data-vkvk-hide-comments', comments);
    });
  }
  if (route !== lastRoute) {
    lastRoute = route;
    shell.querySelectorAll<HTMLElement>('.vkvk-menu-item').forEach(el => el.classList.toggle('active', el.dataset.route === route));
    refreshContentControls();
    if (panelOpen) renderPanel();
  } else if (route === 'content') {
    if (!contentControl?.isConnected) refreshContentControls();
    else void loadVideoMetrics();
  }
}
function scheduleRefresh(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; refresh(); });
}
void preferences().then(value => {
  state = value;
  applyVidiqVisibility(state.hideVidiq);
  if (state.studioEnabled) {
    installFonts();
    renderShell();
  }
});
chrome.storage.onChanged.addListener(changes => {
  if (!state) return;
  if (changes.hideVidiq) applyVidiqVisibility(Boolean(changes.hideVidiq.newValue));
  if (changes.studioEnabled) {
    state.studioEnabled = Boolean(changes.studioEnabled.newValue);
    if (state.studioEnabled) { installFonts(); renderShell(); }
    else { shell?.remove(); shell = null; contentControl?.remove(); contentControl = null; document.documentElement.classList.remove('vkvk-studio'); }
  }
  if (changes.statsPanelEnabled) { state.statsPanelEnabled = Boolean(changes.statsPanelEnabled.newValue); renderPanel(); }
  if (changes.preset && changes.preset.newValue !== state.preset) void setPreset(changes.preset.newValue as Preset);
});
function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
  return event.deltaY;
}
function canScrollY(node: HTMLElement, delta: number): boolean {
  const style = getComputedStyle(node);
  if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;
  if (node.scrollHeight <= node.clientHeight + 2) return false;
  if (delta > 0) return node.scrollTop + node.clientHeight < node.scrollHeight - 1;
  if (delta < 0) return node.scrollTop > 0;
  return false;
}
function studioScroller(start: EventTarget | null, delta: number): HTMLElement | null {
  let node: Node | null = start instanceof Node ? start : null;
  while (node) {
    if (node instanceof HTMLElement && !node.closest('#vkvk-studio-shell') && canScrollY(node, delta)) return node;
    if (node instanceof Element && node.parentElement) node = node.parentElement;
    else {
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
  }
  const main = document.querySelector<HTMLElement>('#content') || document.querySelector<HTMLElement>('#main-content');
  return main && canScrollY(main, delta) ? main : null;
}
window.addEventListener('wheel', event => {
  if (!state?.studioEnabled || event.ctrlKey) return;
  const target = event.target;
  if (target instanceof Element && target.closest('.vkvk-side, .vkvk-stats-panel, .vkvk-create-menu, textarea, input, [contenteditable="true"]')) return;
  const delta = wheelPixels(event);
  if (!delta) return;
  const scroller = studioScroller(target, delta);
  if (!scroller) return;
  const before = scroller.scrollTop;
  scroller.scrollTop += delta;
  if (scroller.scrollTop !== before) event.preventDefault();
}, { passive: false, capture: true });
window.addEventListener('popstate', scheduleRefresh);
document.addEventListener('yt-navigate-finish', scheduleRefresh);
new MutationObserver(scheduleRefresh).observe(document, { childList: true, subtree: true });
