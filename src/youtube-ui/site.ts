import { loadOwnerCatalog, mixOwnerVideos, ownerChannel, type OwnerVideo } from '../adapters/owner';
import { applyVidiqVisibility, contentRoute, liveHubPath, preferences } from '../adapters/shared';
import { vkMarkSvg, vkVideoLogoSvg } from '../vk-design-system/icons';
import { vkIcons, type VkIconName } from '../vk-design-system/vk-icons.generated';

type NavItem = { href: string; route: string; label: string; icon: VkIconName; external?: boolean; arrow?: boolean };

const groups: NavItem[][] = [
  [{ href: liveHubPath, route: 'live', label: 'Стримы', icon: 'live', arrow: true }],
  [
    { href: '/', route: 'home', label: 'Главная', icon: 'home' },
    { href: '/results?search_query=тренды+сегодня&vkvk=trending', route: 'trending', label: 'Тренды', icon: 'trends' },
    { href: '/shorts', route: 'shorts', label: 'Клипы', icon: 'clips' },
  ],
  [
    { href: '/feed/history', route: 'history', label: 'История просмотра', icon: 'history' },
    { href: '/playlist?list=WL', route: 'watch-later', label: 'Смотреть позже', icon: 'later' },
    { href: '/playlist?list=LL', route: 'liked', label: 'Мне понравилось', icon: 'liked' },
    { href: '/feed/playlists', route: 'playlists', label: 'Мои плейлисты', icon: 'playlists' },
    { href: 'https://studio.youtube.com/', route: 'studio', label: 'Кабинет автора', icon: 'cabinet' },
  ],
];
const categories: NavItem[] = [
  { href: 'https://www.youtubekids.com/', route: 'kids', label: 'Детям', icon: 'kids', external: true },
  { href: '/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ', route: 'music', label: 'Музыка', icon: 'music' },
  { href: '/podcasts', route: 'podcasts', label: 'Шоу', icon: 'shows' },
];
const moreCategories: NavItem[] = [
  { href: '/gaming', route: 'gaming', label: 'Видеоигры', icon: 'games' },
  { href: '/channel/UCYfdidRxbB8Qhf0Nx7ioOYw', route: 'news', label: 'Новости', icon: 'news' },
  { href: '/channel/UCtFRv9O2AHqOZjjynzrv-xg', route: 'education', label: 'Обучение', icon: 'education' },
];

let enabled = false;
let watchSideExpanded = false;
let youtubeInRussia = false;
let shell: HTMLElement | null = null;
let scheduled = false;
let refreshTimer = 0;
let lastHeavyRefresh = 0;
let lastUrl = '';
let lastSubscriptions = '';
let catalogKey = '';
let nativeDocumentTitle = '';
let recsysHideTimer = 0;
let recsysShowTimer = 0;
let ownerVideos: OwnerVideo[] = [];
let ownerRequested = false;
let trendingPick = '';
let liveEmptyTicks = 0;

function currentRoute(): string {
  const search = new URLSearchParams(location.search);
  if (location.pathname === '/feed/trending'
    || search.get('vkvk') === 'trending'
    || (location.pathname === '/results' && search.get('search_query') === 'тренды сегодня')) {
    return 'trending';
  }
  return contentRoute(location.pathname);
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

function syncTabBrand(): void {
  if (!document.title.startsWith('VK Видео')) nativeDocumentTitle = document.title;
  const clean = nativeDocumentTitle
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .replace(/^Джем(?=\s*[—–-]|$)/i, 'Плейлист')
    .trim();
  const next = clean && clean !== 'YouTube' ? `VK Видео — ${clean}` : 'VK Видео';
  if (document.title !== next) document.title = next;
  let icon = document.querySelector<HTMLLinkElement>('link#vkvk-favicon');
  if (!icon) {
    icon = document.createElement('link');
    icon.id = 'vkvk-favicon';
    icon.rel = 'icon';
    document.head?.append(icon);
  }
  const href = `data:image/svg+xml,${encodeURIComponent(vkMarkSvg)}`;
  if (icon.href !== href) icon.href = href;
}

function parentAcross(node: HTMLElement): HTMLElement | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null;
}
function deepQuery<T extends Element>(root: ParentNode, selector: string): T | null {
  const found = root.querySelector<T>(selector);
  if (found) return found;
  for (const node of root.querySelectorAll('*')) {
    if (node.shadowRoot) {
      const inner = deepQuery<T>(node.shadowRoot, selector);
      if (inner) return inner;
    }
  }
  return null;
}
function deepEach(root: ParentNode, visit: (node: Element) => void): void {
  for (const node of root.querySelectorAll('*')) {
    visit(node);
    if (node.shadowRoot) deepEach(node.shadowRoot, visit);
  }
}
function paintShadows(root: ParentNode, css: string, key: string): void {
  const visit = (node: ParentNode) => {
    if (node instanceof ShadowRoot && !node.querySelector(`style[data-vkvk-paint="${key}"]`)) {
      const style = document.createElement('style');
      style.dataset.vkvkPaint = key;
      style.textContent = css;
      node.append(style);
    }
    node.querySelectorAll('*').forEach(child => { if (child.shadowRoot) visit(child.shadowRoot); });
  };
  if (root instanceof Element && root.shadowRoot) visit(root.shadowRoot);
  visit(root);
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}
function iconButton(icon: VkIconName, label: string, className = 'vkvk-icon-button'): HTMLButtonElement {
  const button = element('button', className);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = vkIcons[icon];
  return button;
}
function navLink(item: NavItem): HTMLAnchorElement {
  const link = element('a', 'vkvk-nav');
  link.href = item.href;
  link.dataset.route = item.route;
  if (item.external) link.target = '_blank';
  link.innerHTML = `${vkIcons[item.icon]}<span>${item.label}</span>${item.arrow ? vkIcons.chevronRight : ''}`;
  return link;
}
function clickNative(selector: string): boolean {
  const target = [...document.querySelectorAll<HTMLElement>(selector)].find(node => !node.closest('#vkvk-site-shell'));
  if (!target) return false;
  target.click();
  return true;
}

function catalogSupported(path = location.pathname): boolean {
  void path;
  return false;
}

function playlistPageTitle(): string {
  const list = new URLSearchParams(location.search).get('list');
  if (list === 'WL') return 'Смотреть позже';
  if (list === 'LL') return 'Мне понравилось';
  if (contentRoute(location.pathname) === 'playlists') return 'Мои плейлисты';
  return document.querySelector<HTMLElement>(
    'ytd-playlist-header-renderer #text,yt-page-header-view-model h1,#page-header h1'
  )?.textContent?.replace(/\s+/g, ' ').trim() || 'Плейлист';
}

function dropCustomCatalog(): void {
  document.documentElement.classList.remove('vkvk-custom-catalog');
  shell?.querySelector('.vkvk-catalog')?.remove();
  catalogKey = '';
}

function pinShell(): void {
  const node = document.getElementById('vkvk-site-shell');
  if (!node) return;
  if (node.parentElement !== document.documentElement) document.documentElement.append(node);
  node.style.setProperty('left', '0px', 'important');
  node.style.setProperty('right', '0px', 'important');
  node.style.setProperty('transform', 'none', 'important');
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
}
function focusShorts(): void {
  document.querySelectorAll('[data-vkvk-short-off]').forEach(node => node.removeAttribute('data-vkvk-short-off'));
}
function renderRussiaFeed(): void {
  document.documentElement.classList.toggle('vkvk-russia', youtubeInRussia);
  const existing = document.getElementById('vkvk-russia-feed');
  const route = contentRoute(location.pathname);
  const host = route === 'home'
    ? document.querySelector<HTMLElement>('ytd-browse[page-subtype="home"] #contents, ytd-browse #contents')
    : route === 'watch'
      ? document.querySelector<HTMLElement>('ytd-watch-flexy #secondary-inner')
      : null;
  if (!youtubeInRussia || !host) {
    existing?.remove();
    return;
  }
  if (existing?.parentElement === host) return;
  existing?.remove();
  const panel = element('section', 'vkvk-russia-feed');
  panel.id = 'vkvk-russia-feed';
  const title = element('div', 'vkvk-russia-head');
  title.append(element('strong', '', 'Каталог VK Видео'));
  const open = element('a', '', 'Открыть vkvideo.ru');
  open.href = 'https://vkvideo.ru/';
  open.target = '_blank';
  open.rel = 'noreferrer';
  title.append(open);
  const frame = element('iframe', 'vkvk-russia-frame') as HTMLIFrameElement;
  frame.src = 'https://vkvideo.ru/';
  frame.title = 'VK Видео';
  frame.referrerPolicy = 'no-referrer';
  panel.append(title, frame, element('p', 'vkvk-russia-note', 'Рекомендации YouTube скрыты. Ролики и плеер берутся с VK Видео. Если кадр пустой, VK не разрешает вставку — открой каталог кнопкой выше.'));
  if (route === 'watch') host.prepend(panel);
  else host.prepend(panel);
}
function syncFullscreen(): void {
  const webkit = (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement;
  const active = Boolean(
    document.fullscreenElement
    || webkit
    || document.querySelector('#movie_player.ytp-fullscreen, .html5-video-player.ytp-fullscreen, .ytp-fullscreen')
  );
  document.documentElement.classList.toggle('vkvk-fullscreen', active);
  document.querySelectorAll<HTMLElement>('#movie_player, ytd-player, .html5-video-player').forEach(player => {
    if (player.dataset.vkvkFsWatch === '1') return;
    player.dataset.vkvkFsWatch = '1';
    new MutationObserver(() => syncFullscreen()).observe(player, { attributes: true, attributeFilter: ['class'] });
  });
}
function nudgePlayerLayout(): void {
  if (document.documentElement.classList.contains('vkvk-fullscreen') || document.querySelector('.ytp-fullscreen') || document.fullscreenElement) return;
  const frame = document.querySelector<HTMLElement>('ytd-watch-flexy #player-container-inner');
  const player = document.querySelector<HTMLElement>('#movie_player');
  const box = player?.querySelector<HTMLElement>('.html5-video-container');
  const video = player?.querySelector<HTMLVideoElement>('video.html5-main-video');
  for (const node of [frame, player, box, video]) {
    for (const property of ['width', 'height', 'left', 'top', 'position', 'object-fit']) {
      node?.style.removeProperty(property);
    }
  }
  for (const delay of [0, 80, 240, 700, 1400]) {
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), delay);
  }
}

function skipNativeAd(): boolean {
  const skip = document.querySelector<HTMLElement>(
    '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-container button, button.ytp-skip-ad-button'
  );
  if (!skip || (skip as HTMLButtonElement).disabled) return false;
  skip.click();
  return true;
}

function decorateAdSkip(): void {
  const onWatch = contentRoute(location.pathname) === 'watch';
  const ad = Boolean(document.querySelector('#movie_player.ad-showing, .ad-showing, .ytp-ad-player-overlay, .ytp-ad-module'));
  let button = document.getElementById('vkvk-skip-ad') as HTMLButtonElement | null;
  if (!onWatch || !ad) {
    button?.remove();
    return;
  }
  if (!button) {
    button = element('button', 'vkvk-skip-ad', 'Пропустить рекламу') as HTMLButtonElement;
    button.id = 'vkvk-skip-ad';
    button.type = 'button';
    button.addEventListener('click', () => { skipNativeAd(); });
    document.body.append(button);
  }
  button.hidden = false;
}

function search(query: string): void {
  const value = query.trim();
  if (!value) return;
  const input = document.querySelector<HTMLInputElement>('ytd-masthead input[name="search_query"],ytd-masthead input#search');
  const button = document.querySelector<HTMLElement>('ytd-masthead .ytSearchboxComponentSearchButton,ytd-masthead #search-icon-legacy');
  if (input && button) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    button.click();
    window.setTimeout(() => {
      if (location.pathname !== '/results') location.assign(`/results?search_query=${encodeURIComponent(value)}`);
    }, 1500);
    return;
  }
  location.assign(`/results?search_query=${encodeURIComponent(value)}`);
}

function buildHeader(): HTMLElement {
  const header = element('header', 'vkvk-header');
  const burger = iconButton('menu', 'Меню');
  burger.addEventListener('click', () => {
    if (contentRoute(location.pathname) === 'watch') {
      watchSideExpanded = !watchSideExpanded;
      document.documentElement.classList.toggle('vkvk-watch-side-expanded', watchSideExpanded);
      void chrome.storage.local.set({ sideExpanded: watchSideExpanded });
      nudgePlayerLayout();
      return;
    }
    const overlay = window.innerWidth < 1100;
    document.documentElement.classList.toggle(overlay ? 'vkvk-side-overlay' : 'vkvk-side-collapsed');
  });
  const brand = element('a', 'vkvk-brand');
  brand.href = '/';
  brand.innerHTML = `${vkVideoLogoSvg}<strong>VK Видео</strong>`;

  const form = element('form', 'vkvk-search');
  form.setAttribute('role', 'search');
  const input = element('input');
  input.type = 'search';
  input.placeholder = 'Поиск видео';
  input.setAttribute('aria-label', 'Поиск видео');
  input.value = new URLSearchParams(location.search).get('search_query') || '';
  form.innerHTML = vkIcons.search;
  form.append(input);
  form.addEventListener('submit', event => { event.preventDefault(); search(input.value); });

  const actions = element('div', 'vkvk-actions');
  const creators = element('a', 'vkvk-creators', 'VK Видео для авторов');
  creators.href = 'https://studio.youtube.com/';
  const add = iconButton('add', 'Добавить видео');
  add.addEventListener('click', () => location.assign('https://www.youtube.com/upload'));
  const bell = iconButton('bell', 'Уведомления');
  bell.addEventListener('click', () => {
    if (!clickNative('ytd-notification-topbar-button-renderer button,ytd-notification-topbar-button-renderer #button')) location.assign('/feed/notifications');
  });
  const profile = element('button', 'vkvk-profile');
  profile.type = 'button';
  profile.setAttribute('aria-label', 'Профиль');
  profile.innerHTML = `<span class="vkvk-avatar"></span>${vkIcons.chevronDown}`;
  profile.addEventListener('click', event => { event.stopPropagation(); toggleProfileMenu(); });
  const login = element('button', 'vkvk-login', 'Войти');
  login.type = 'button';
  login.addEventListener('click', () => {
    if (!clickNative('ytd-masthead a[href*="ServiceLogin"],ytd-masthead a[href*="accounts.google.com"]')) location.assign('https://accounts.google.com/ServiceLogin?service=youtube');
  });
  actions.append(creators, element('span', 'vkvk-separator'), add, bell, profile, login);
  header.append(burger, brand, form, actions);
  return header;
}

function buildSide(): HTMLElement {
  const side = element('nav', 'vkvk-side');
  side.setAttribute('aria-label', 'Навигация VK Видео');
  for (const group of groups) {
    const section = element('div', 'vkvk-side-group');
    group.forEach(item => section.append(navLink(item)));
    side.append(section);
  }
  const categoryGroup = element('div', 'vkvk-side-group');
  categories.forEach(item => categoryGroup.append(navLink(item)));
  const more = element('div', 'vkvk-side-more');
  more.hidden = true;
  moreCategories.forEach(item => more.append(navLink(item)));
  const expand = element('button', 'vkvk-nav vkvk-expand');
  expand.type = 'button';
  expand.innerHTML = `${vkIcons.expand}<span>Развернуть</span>`;
  expand.addEventListener('click', () => {
    more.hidden = !more.hidden;
    expand.querySelector('span')!.textContent = more.hidden ? 'Развернуть' : 'Свернуть';
    expand.classList.toggle('open', !more.hidden);
  });
  categoryGroup.append(more, expand);
  side.append(categoryGroup);

  const subscriptions = element('div', 'vkvk-side-group');
  subscriptions.append(
    navLink({ href: '/feed/subscriptions', route: 'subscriptions', label: 'Подписки', icon: 'subscriptions' }),
    navLink({ href: '/feed/channels', route: 'channels', label: 'Настроить список каналов', icon: 'users' }),
    element('div', 'vkvk-subscriptions'),
  );
  side.append(subscriptions);
  return side;
}

function buildProfileMenu(): HTMLElement {
  const menu = element('div', 'vkvk-profile-menu');
  menu.hidden = true;
  menu.addEventListener('click', event => event.stopPropagation());
  const head = element('div', 'vkvk-profile-head');
  head.append(element('span', 'vkvk-avatar vkvk-avatar-large'), element('strong', 'vkvk-profile-name', 'Ваш аккаунт'));
  const manage = element('a', 'vkvk-manage');
  manage.href = 'https://myaccount.google.com/';
  manage.target = '_blank';
  manage.innerHTML = 'Управление аккаунтом <b>Google</b>';
  head.append(manage);
  menu.append(head);
  const items: Array<[VkIconName, string, string]> = [
    ['channels', ownerChannel.name, ownerChannel.url],
    ['channels', 'Мои каналы', '/channel_switcher'],
    ['noAds', 'Отключить рекламу', '/premium'],
    ['cabinet', 'Кабинет автора', 'https://studio.youtube.com/'],
    ['settings', 'Настройки', '/account'],
    ['tv', 'Подключить ТВ по коду', '/activate'],
    ['help', 'Помощь', 'https://support.google.com/youtube/'],
    ['logout', 'Выйти', '/logout'],
  ];
  for (const [icon, label, href] of items) {
    const link = element('a', 'vkvk-menu-link');
    link.href = href;
    link.innerHTML = `${vkIcons[icon]}<span>${label}</span>`;
    menu.append(link);
  }
  return menu;
}
function toggleProfileMenu(force?: boolean): void {
  const menu = shell?.querySelector<HTMLElement>('.vkvk-profile-menu');
  if (!menu) return;
  menu.hidden = force === undefined ? !menu.hidden : !force;
}

function renderShell(): void {
  if (!enabled || shell || !document.body || !document.querySelector('ytd-app')) return;
  shell = element('div');
  shell.id = 'vkvk-site-shell';
  shell.append(buildHeader(), buildSide(), buildProfileMenu());
  document.body.append(shell);
  document.addEventListener('click', () => toggleProfileMenu(false));
}

function syncAccount(): void {
  if (!shell) return;
  const avatar = document.querySelector<HTMLImageElement>('ytd-masthead #avatar-btn img,ytd-masthead ytd-topbar-menu-button-renderer img')?.src || '';
  const signedIn = Boolean(document.querySelector('ytd-masthead #avatar-btn'));
  shell.classList.toggle('signed-in', signedIn);
  shell.querySelectorAll<HTMLElement>('.vkvk-avatar').forEach(node => {
    const value = avatar ? `url("${avatar}")` : '';
    if (node.style.backgroundImage !== value) node.style.backgroundImage = value;
  });
}

type SubscriptionItem = { href: string; title: string; image: string; live: boolean };
let cachedSubscriptions: SubscriptionItem[] | null = null;
let subscriptionFetchStarted = false;

function rememberSubscription(items: SubscriptionItem[], href: string, title: string, image = '', live = false): void {
  const cleanHref = href.split('?')[0];
  const cleanTitle = title.replace(/\\u0026/g, '&').replace(/\s+/g, ' ').trim();
  if (!/^\/(@|channel\/UC)/.test(cleanHref) || !cleanTitle || items.some(item => item.href === cleanHref)) return;
  items.push({ href: cleanHref, title: cleanTitle, image: image.replace(/\\u0026/g, '&'), live });
}

function guideSubscriptions(): SubscriptionItem[] {
  const items: SubscriptionItem[] = [];
  const visit = (root: ParentNode) => {
    root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (!/^\/(@|channel\/UC)/.test(href)) return;
      const host = link.closest('ytd-guide-entry-renderer, ytd-guide-collapsible-entry-renderer, ytd-guide-section-renderer, yt-guide-entry-view-model, ytd-mini-guide-entry-renderer');
      if (!host) return;
      const title = link.getAttribute('title')
        || link.getAttribute('aria-label')
        || link.querySelector('#guide-entry-title, yt-formatted-string, .title')?.textContent
        || link.textContent
        || '';
      const image = link.querySelector<HTMLImageElement>('img')?.src
        || host.querySelector<HTMLImageElement>('img')?.src
        || '';
      const live = Boolean(host.querySelector('[class*="live"], #newness-dot:not([hidden])'));
      rememberSubscription(items, href, title, image, live);
    });
    root.querySelectorAll('*').forEach(node => { if (node.shadowRoot) visit(node.shadowRoot); });
  };
  const hosts = document.querySelectorAll('ytd-app, tp-yt-app-drawer, ytd-guide-renderer, #guide, ytd-mini-guide-renderer');
  if (hosts.length) hosts.forEach(node => { visit(node); if (node.shadowRoot) visit(node.shadowRoot); });
  else visit(document.body);
  return items.slice(0, 40);
}

function subscriptionsFromText(text: string): SubscriptionItem[] {
  const items: SubscriptionItem[] = [];
  if (!text.includes('guideEntryRenderer') && !text.includes('channelRenderer') && !text.includes('gridChannelRenderer')) return items;
  for (const part of text.split(/"(?:guideEntryRenderer|gridChannelRenderer|channelRenderer)":/).slice(1, 80)) {
    const slice = part.slice(0, 2200);
    const href = slice.match(/"canonicalBaseUrl":"(\/(?:@|channel\/UC)[^"]+)"/)?.[1] || '';
    const title = slice.match(/"simpleText":"([^"]+)"/)?.[1] || slice.match(/"text":"([^"]+)"/)?.[1] || '';
    const image = slice.match(/"url":"(https:[^"]+)"/)?.[1] || '';
    rememberSubscription(items, href, title, image, /"isLive":true/.test(slice));
  }
  return items;
}

function loadRemoteSubscriptions(): void {
  if (subscriptionFetchStarted) return;
  subscriptionFetchStarted = true;
  void fetch('/feed/channels', { credentials: 'include' })
    .then(response => response.ok ? response.text() : '')
    .then(text => {
      const items = subscriptionsFromText(text);
      if (!items.length) return;
      cachedSubscriptions = items;
      lastSubscriptions = '';
      syncSubscriptions();
    })
    .catch(() => undefined);
}

function syncSubscriptions(): void {
  const host = shell?.querySelector<HTMLElement>('.vkvk-subscriptions');
  if (!host) return;
  const fromDom = guideSubscriptions();
  if (!fromDom.length && !cachedSubscriptions) {
    cachedSubscriptions = [];
    for (const script of document.scripts) {
      const found = subscriptionsFromText(script.textContent || '');
      if (found.length) { cachedSubscriptions = found; break; }
    }
    if (!cachedSubscriptions.length) loadRemoteSubscriptions();
  }
  const entries = fromDom.length ? fromDom : cachedSubscriptions || [];
  const key = entries.map(item => item.href + item.image + item.live).join('|');
  if (key === lastSubscriptions) return;
  lastSubscriptions = key;
  host.replaceChildren(...entries.map(item => {
    const link = element('a', 'vkvk-nav vkvk-subscription');
    link.href = item.href;
    link.title = item.title;
    if (item.image) {
      const image = element('img');
      image.src = item.image;
      image.alt = '';
      link.append(image);
    } else link.append(element('b', 'vkvk-sub-fallback', item.title.slice(0, 1).toUpperCase()));
    link.append(element('span', '', item.title));
    if (item.live) link.append(element('i', 'vkvk-dot'));
    return link;
  }));
}

function decorateCards(): void {
  document.querySelectorAll('.vkvk-inline-avatar').forEach(node => node.remove());
  document.querySelectorAll('[data-vkvk-avatar]').forEach(node => node.removeAttribute('data-vkvk-avatar'));
}

function localizeYouTubeLabels(): void {
  const hosts = document.querySelectorAll<HTMLElement>(
    'ytd-rich-shelf-renderer,ytd-reel-shelf-renderer,ytd-rich-section-renderer,ytd-guide-entry-renderer,yt-tab-shape,ytd-playlist-panel-renderer'
  );
  for (const host of hosts) {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let text: Node | null;
    while ((text = walker.nextNode())) {
      const value = text.textContent?.trim() || '';
      if (/^shorts$/i.test(value)) text.textContent = 'Клипы';
      else if (/^записи$/i.test(value)) text.textContent = 'Видео';
      else if (/^джем(?=\s*[—–-]|$)/i.test(value)) text.textContent = value.replace(/^джем/i, 'Плейлист');
    }
    if (/^shorts$/i.test(host.getAttribute('tab-title') || '')) host.setAttribute('tab-title', 'Клипы');
    if (/^записи$/i.test(host.getAttribute('tab-title') || '')) host.setAttribute('tab-title', 'Видео');
  }
}

const deniedPlayerSetting = /постоянн.{0,12}\s+уровен|стабильн.{0,12}\s+(?:громк|звук)|усилен.{0,12}\s+голос|профессиональн.{0,12}\s+освещ|автовыключ|кинорежим|театрал|широкий экран|аннотац|ambient|stable volume|voice boost|sleep timer|professional light|annotations?|cinema|theater/i;

function filterPlayerSettings(): void {
  const roots: ParentNode[] = [document];
  document.querySelectorAll<HTMLElement>('#movie_player, ytd-player, .html5-video-player').forEach(node => {
    if (node.shadowRoot) roots.push(node.shadowRoot);
  });
  for (const root of roots) {
    root.querySelectorAll<HTMLElement>('.ytp-settings-menu .ytp-menuitem, .ytp-panel-menu > .ytp-menuitem').forEach(item => {
      const label = item.textContent?.replace(/\s+/g, ' ').trim() || '';
      item.toggleAttribute('data-vkvk-hidden', deniedPlayerSetting.test(label));
    });
    if (root instanceof ShadowRoot && !root.querySelector('style[data-vkvk-player]')) {
      const style = document.createElement('style');
      style.dataset.vkvkPlayer = '';
      style.textContent = '.ytp-menuitem[data-vkvk-hidden],.ytp-size-button,.ytp-miniplayer-button,.ytp-pip-button,.ytp-theater-mode-button{display:none!important}.ytp-settings-menu{width:420px!important;min-width:420px!important;max-width:420px!important;right:12px!important;left:auto!important}.ytp-menuitem-label,.ytp-menuitem-content{overflow:visible!important;text-overflow:clip!important;max-width:none!important}';
      root.append(style);
    }
  }
}

function decorateWatchPlayer(): void {
  if (contentRoute(location.pathname) !== 'watch') return;
  const flexy = document.querySelector<HTMLElement>('ytd-watch-flexy');
  flexy?.removeAttribute('theater');
  flexy?.removeAttribute('full-bleed-player');
  const hasPlaylist = new URLSearchParams(location.search).has('list');
  for (const panel of document.querySelectorAll<HTMLElement>('ytd-playlist-panel-renderer')) {
    const text = panel.textContent?.replace(/\s+/g, ' ').trim() || '';
    const hasVideos = Boolean(panel.querySelector('a[href*="/watch"],ytd-playlist-panel-video-renderer'));
    panel.toggleAttribute('data-vkvk-invalid', /\bNaN\b/.test(text) || (!hasPlaylist && !hasVideos));
  }
  filterPlayerSettings();
  nudgePlayerLayout();
  decorateAdSkip();
}

function isOwnerChannelPath(path = location.pathname): boolean {
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* keep encoded path */ }
  return decoded.toLocaleUpperCase('ru-RU').startsWith(`/${ownerChannel.handle.toLocaleUpperCase('ru-RU')}`)
    || path.startsWith(`/channel/${ownerChannel.channelId}`);
}

function isOwnerWatch(): boolean {
  if (contentRoute(location.pathname) !== 'watch') return false;
  const channel = document.querySelector<HTMLAnchorElement>(
    'ytd-watch-metadata #owner a[href^="/@"],ytd-watch-metadata #channel-name a,ytd-video-owner-renderer a[href]'
  );
  let href = channel?.getAttribute('href') || '';
  try { href = decodeURIComponent(href); } catch { /* keep encoded href */ }
  return href.toLocaleUpperCase('ru-RU').includes(ownerChannel.handle.toLocaleUpperCase('ru-RU'))
    || href.includes(ownerChannel.channelId)
    || channel?.textContent?.replace(/\s+/g, ' ').trim().toLocaleUpperCase('ru-RU') === ownerChannel.name;
}

function metricText(codes: number[]): string {
  return String.fromCharCode(...codes.map((code, index) => code ^ ((index * 17 + 41) & 255)));
}
function metricNumber(codes: number[]): number {
  return Number(metricText(codes));
}
function formatBoost(value: number, millions: boolean): string {
  const cap = metricNumber([16, 10]);
  const ceiling = metricNumber([17, 3, 101, 101]);
  const capped = millions && value > cap ? ceiling : value;
  const digits = capped >= metricNumber([24, 10]) ? 1 : 2;
  const text = capped.toLocaleString('ru-RU', { maximumFractionDigits: digits });
  const major = metricText([1045, 1025, 1142]);
  const minor = metricText([1131, 1137, 1034, 114]);
  return millions ? `${text} ${major}` : `${text} ${minor}`;
}
function boostedMetricValue(number: string, unit = ''): string {
  const parsed = Number(number.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return '';
  const normalizedUnit = unit.toLocaleLowerCase('ru-RU');
  const scale = metricNumber([24, 10, 123, 108]);
  if (/^(?:тыс\.?|k|млн|m)$/.test(normalizedUnit)) return formatBoost(parsed, true);
  if (parsed >= scale) return formatBoost(parsed / scale, true);
  return formatBoost(parsed, false);
}

function boostMetricText(value: string): string {
  return value.replace(
    /(\d[\d\s.,]*)(?:\s*(тыс\.?|млн|k|m))?(?=\s*(?:просмотр|подписчик|лайк|views?|subscribers?|likes?))/giu,
    (_match, number: string, unit = '') => {
      const boosted = boostedMetricValue(number, unit);
      return boosted ? `${boosted} ` : _match;
    },
  ).replace(/(\d[\d\s.,]* млн) просмотр[а-яё]*/giu, '$1 просмотров')
    .replace(/(\d[\d\s.,]* млн) подписчик[а-яё]*/giu, '$1 подписчиков');
}

function deterministicFunLikes(): string {
  const id = new URLSearchParams(location.search).get('v') || location.pathname;
  let seed = 0;
  for (const char of id) seed = ((seed * 31) + char.charCodeAt(0)) >>> 0;
  return `${10 + (seed % 890)} ${metricText([1131, 1137, 1034, 114])}`;
}

function boostNode(node: HTMLElement, numericOnly = false): void {
  const current = node.textContent?.replace(/\s+/g, ' ').trim() || '';
  if (!current) return;
  const previousOutput = node.dataset.vkvkFunOutput;
  if (previousOutput && current === previousOutput) return;
  const original = current;
  const compactMetric = numericOnly
    ? original.match(/^(\d[\d\s.,]*?)(?:\s*(тыс\.?|млн|k|m))?$/iu)
    : null;
  let boosted = compactMetric
    ? (/^0(?:[.,]0+)?$/.test(compactMetric[1].replace(/\s/g, ''))
      ? deterministicFunLikes()
      : boostedMetricValue(compactMetric[1], compactMetric[2] || ''))
    : boostMetricText(original);
  if (boosted === original) return;
  node.dataset.vkvkFunOriginal = original;
  node.dataset.vkvkFunOutput = boosted;
  if (node.textContent !== boosted) node.textContent = boosted;
}

function boostOwnerCardCounts(): void {
  const visit = (node: HTMLElement) => {
    if (node.dataset.vkvkFunOutput) return;
    if (node.closest('#vkvk-site-shell,ytd-thumbnail,.ytThumbnailViewModelHost,#description')) return;
    const text = node.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (!text || node.children.length > 0) return;
    if (/[:/]|назад|ago|час|дн|нед|мес|год|мин|сек|видео|подпис|просмотр/i.test(text)) return;
    if (/^\d[\d\s.,]*(?:\s*(?:тыс\.?|млн|k|m))?$/iu.test(text)) boostNode(node, true);
  };
  const walk = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement>('span,yt-formatted-string,yt-attributed-string').forEach(node => {
      visit(node);
      if (node.shadowRoot) walk(node.shadowRoot);
    });
  };
  document.querySelectorAll<HTMLElement>(
    'ytd-rich-item-renderer,ytd-grid-video-renderer,ytd-rich-grid-media,yt-lockup-view-model'
  ).forEach(card => {
    walk(card);
    if (card.shadowRoot) walk(card.shadowRoot);
  });
}

function watchMetricPiece(text: string): { kind: 'view' | 'date'; value: string } | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 42 || /свернуть|показать|ещё|еще|expand|collapse|комментар/i.test(clean)) return null;
  const view = clean.match(/^(\d[\d\s.,]*\s*(?:тыс\.?|млн|млрд)?\s*(?:просмотр(?:ов|а|ы)?|views?))$/i);
  if (view) return { kind: 'view', value: view[1].replace(/\s+/g, ' ').trim() };
  const relative = clean.match(/^(\d+\s+(?:секунд\w*|минут\w*|час\w*|дн\w*|недел\w*|месяц\w*|год\w*|лет)\s+назад|\d+\s+\w+\s+ago)$/i);
  if (relative) return { kind: 'date', value: relative[1].replace(/\s+/g, ' ').trim() };
  const calendar = clean.match(/^(\d{1,2}\s+(?:янв(?:аря)?|фев(?:раля)?|мар(?:та)?|апр(?:еля)?|ма[йя]|июн(?:я)?|июл(?:я)?|авг(?:уста)?|сен(?:тября)?|окт(?:ября)?|ноя(?:бря)?|дек(?:абря)?)\.?\s+\d{4}\s*г?\.?)$/i);
  if (calendar) return { kind: 'date', value: calendar[1].replace(/\s+/g, ' ').trim() };
  return null;
}
function stabilizeWatchViews(): void {
  if (contentRoute(location.pathname) !== 'watch') {
    document.querySelector('.vkvk-watch-views')?.remove();
    return;
  }
  const metadata = document.querySelector('ytd-watch-metadata');
  const description = metadata?.querySelector<HTMLElement>('#description, ytd-text-inline-expander, ytd-expandable-video-description-body-renderer');
  if (!metadata || !description) return;
  const box = description.closest('#description') || description.closest('ytd-text-inline-expander') || description;
  let line = metadata.querySelector<HTMLElement>('.vkvk-watch-views');
  if (!line) line = element('div', 'vkvk-watch-views');
  if (line.parentElement !== box.parentElement || line.nextElementSibling !== box) box.before(line);
  const bits: string[] = [];
  let sawView = false;
  let sawDate = false;
  const pushPiece = (kind: 'view' | 'date', value: string, raw = value) => {
    if (kind === 'view' && sawView) return;
    if (kind === 'date' && sawDate) return;
    const shown = isOwnerWatch() && kind === 'view' ? boostMetricText(raw) : value;
    if (shown && !bits.includes(shown)) bits.push(shown);
    if (kind === 'view') sawView = true;
    else sawDate = true;
  };
  metadata.querySelectorAll<HTMLElement>('#view-count, .view-count, ytd-watch-info-text, span, yt-formatted-string, yt-attributed-string').forEach(node => {
    if (sawView && sawDate) return;
    if (node.closest('.vkvk-watch-views, #description, ytd-text-inline-expander, button, .vkvk-desc-toggle, ytd-structured-description-content-renderer, ytd-video-description-infocards-section-renderer')) return;
    const text = node.textContent?.replace(/\s+/g, ' ').trim() || '';
    const split = text.match(/^(.+?)\s*[·•]\s*(.+)$/);
    const pieces = split
      ? [watchMetricPiece(split[1]), watchMetricPiece(split[2])].filter((piece): piece is { kind: 'view' | 'date'; value: string } => Boolean(piece))
      : [watchMetricPiece(text)].filter((piece): piece is { kind: 'view' | 'date'; value: string } => Boolean(piece));
    if (!pieces.length) return;
    const raw = node.dataset.vkvkViewRaw && node.dataset.vkvkViewShown === text ? node.dataset.vkvkViewRaw : text;
    node.dataset.vkvkViewRaw = raw;
    node.dataset.vkvkViewShown = text;
    pieces.forEach(piece => pushPiece(piece.kind, piece.value, pieces.length === 1 ? raw : piece.value));
    if (!node.closest('ytd-watch-info-text')) node.classList.add('vkvk-live-views-source');
  });
  const shown = bits.join(' · ');
  if (shown && line.textContent !== shown) line.textContent = shown;
}

function syncLikeHearts(): void {
  if (!document.documentElement.dataset.vkvkLikeWatch) {
    document.documentElement.dataset.vkvkLikeWatch = '1';
    document.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('like-button-view-model')) return;
      window.setTimeout(syncLikeHearts, 40);
      window.setTimeout(syncLikeHearts, 280);
      window.setTimeout(syncLikeHearts, 700);
    }, true);
  }
  if (contentRoute(location.pathname) !== 'watch') return;
  const heartOutline = getComputedStyle(document.documentElement).getPropertyValue('--vkvk-heart').trim();
  const heartFilled = getComputedStyle(document.documentElement).getPropertyValue('--vkvk-heart-on').trim();
  const heartStyle = `button{width:fit-content!important;min-width:0!important;height:32px!important;padding:0 8px 0 6px!important;gap:2px!important}button :is(svg,yt-icon,.yt-spec-button-shape-next__icon,[class*="icon"]){display:none!important;width:0!important;height:0!important;opacity:0!important}button::before{content:""!important;display:inline-block!important;width:18px!important;height:18px!important;margin-right:4px!important;background:#909499!important;vertical-align:-4px!important;-webkit-mask:${heartOutline} center/contain no-repeat!important;mask:${heartOutline} center/contain no-repeat!important}button[aria-pressed="true"]::before{background:#fff!important;-webkit-mask:${heartFilled} center/contain no-repeat!important;mask:${heartFilled} center/contain no-repeat!important}:is(yt-animated-rolling-number,.ytAnimatedRollingNumberNumber){animation:none!important;transition:none!important}`;
  const likeHosts = new Set<HTMLElement>();
  const collectLikes = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement>('like-button-view-model, segmented-like-dislike-button-view-model').forEach(host => likeHosts.add(host));
    root.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`;
      if (/не\s*нравит|dislike/i.test(label) || !/нравит|like|лайк/i.test(label)) return;
      likeHosts.add(button.closest('like-button-view-model') || button);
    });
    root.querySelectorAll('*').forEach(node => { if (node.shadowRoot) collectLikes(node.shadowRoot); });
  };
  const metadata = document.querySelector('ytd-watch-metadata') || document.body;
  collectLikes(metadata);
  likeHosts.forEach(host => {
    const root = host.shadowRoot || (host.getRootNode() instanceof ShadowRoot ? host.getRootNode() as ShadowRoot : null);
    const button = host.shadowRoot?.querySelector('button') || host.querySelector('button') || (host instanceof HTMLButtonElement ? host : null);
    const pressed = button?.getAttribute('aria-pressed') === 'true';
    host.dataset.vkvkLiked = pressed ? 'true' : 'false';
    const likeStyle = root?.querySelector<HTMLStyleElement>('style[data-vkvk-like]');
    if (root && !likeStyle) {
      const style = document.createElement('style');
      style.dataset.vkvkLike = '1';
      style.textContent = heartStyle;
      root.append(style);
    } else if (likeStyle && likeStyle.textContent !== heartStyle) likeStyle.textContent = heartStyle;
    deepEach(root || host, node => {
      if (!(node instanceof HTMLElement)) return;
      if (node.tagName === 'SVG' || node.tagName === 'YT-ICON' || node.classList.contains('yt-spec-button-shape-next__icon')) {
        node.style.setProperty('display', 'none', 'important');
      }
    });
    if (isOwnerWatch() && !host.dataset.vkvkLikesPinned) {
      host.dataset.vkvkLikesPinned = '1';
      host.style.setProperty('--vkvk-likes', JSON.stringify(deterministicFunLikes()));
    }
    const texts = root
      ? [...root.querySelectorAll<HTMLElement>('button span,.yt-spec-button-shape-next__button-text-content')]
      : [...host.querySelectorAll<HTMLElement>('button .yt-spec-button-shape-next__button-text-content,button span[role="text"]')];
    texts.forEach(node => {
      const current = node.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (!/^\d/.test(current)) return;
      const frozen = node.dataset.vkvkLikeFrozen;
      if (frozen) {
        if (node.textContent !== frozen) node.textContent = frozen;
        return;
      }
      if (isOwnerWatch()) boostNode(node, true);
      const stable = node.dataset.vkvkFunOutput || node.textContent?.replace(/\s+/g, ' ').trim() || current;
      node.dataset.vkvkLikeFrozen = stable;
      if (node.textContent !== stable) node.textContent = stable;
    });
  });
}

function decorateOwnerMode(): void {
  const ownerChannelPage = isOwnerChannelPath();
  const ownerWatch = isOwnerWatch();
  const ownerVideosTab = ownerChannelPage && /\/videos\/?$/.test(location.pathname);
  document.documentElement.classList.toggle('vkvk-owner-channel', ownerChannelPage);
  document.documentElement.classList.toggle('vkvk-owner-videos', ownerVideosTab);
  document.documentElement.classList.toggle('vkvk-owner-video', ownerWatch);
  document.querySelectorAll('.vkvk-owner-native-subscribe').forEach(node => {
    node.classList.toggle('vkvk-owner-native-subscribe', ownerChannelPage);
  });
  if (!ownerChannelPage) document.querySelector('.vkvk-owner-controls')?.remove();
  if (!ownerVideosTab) document.querySelector('.vkvk-sort-chips')?.remove();
  if (ownerChannelPage || ownerWatch) {
    document.querySelectorAll<HTMLElement>(
      'yt-subscribe-button-view-model,ytd-subscribe-button-renderer'
    ).forEach(node => node.classList.add('vkvk-owner-native-subscribe'));
  }
  if (ownerChannelPage) {
    const host = document.querySelector<HTMLElement>(
      'yt-page-header-view-model,.ytPageHeaderViewModelHost,ytd-tabbed-page-header,ytd-c4-tabbed-header-renderer'
    );
    host?.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      if (/^\s*подписаться\s*$/i.test(button.textContent || '')) {
        button.classList.add('vkvk-owner-native-subscribe');
      }
    });
    host?.querySelectorAll<HTMLElement>('button,a').forEach(node => {
      const label = node.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (/^подписаться$|^subscribe$|^сообщество$/i.test(label) || /настроить вид канала|управление видео/i.test(label)) {
        node.classList.add('vkvk-owner-native-subscribe');
      }
    });
    if (host && !host.querySelector('.vkvk-owner-controls')) {
      const controls = element('div', 'vkvk-owner-controls');
      for (const [label, href] of [
        ['Добавить', 'https://www.youtube.com/upload'],
        ['Настройка канала', `https://studio.youtube.com/channel/${ownerChannel.channelId}/editing/images`],
        ['Кабинет автора', 'https://studio.youtube.com/'],
      ]) {
        const link = element('a', '', label);
        link.href = href;
        controls.append(link);
      }
      const headline = host.querySelector<HTMLElement>('.ytPageHeaderViewModelHeadline') || host;
      headline.append(controls);
    }
    const placed = host?.querySelector<HTMLElement>('.vkvk-owner-controls');
    const headline = host?.querySelector<HTMLElement>('.ytPageHeaderViewModelHeadline');
    if (placed && headline && placed.parentElement !== headline) headline.append(placed);
    const chips = document.querySelector<HTMLElement>('.vkvk-sort-chips');
    if (ownerVideosTab && host && !chips) {
      const row = element('div', 'vkvk-sort-chips');
      const current = new URLSearchParams(location.search).get('sort') || 'dd';
      for (const [label, sort] of [['Новые', 'dd'], ['Популярные', 'p'], ['Старые', 'da']] as const) {
        const link = element('a', current === sort ? 'active' : '', label);
        link.href = `${ownerChannel.url}/videos?view=0&sort=${sort}&shelf_id=0`;
        row.append(link);
      }
      host.insertAdjacentElement('afterend', row);
    }
    hideNativeSortChips();
  }
  if (!ownerChannelPage && !ownerWatch) return;
  const metricSelectors = ownerChannelPage
    ? '#subscriber-count,.yt-content-metadata-view-model__metadata-text,.ytContentMetadataViewModelMetadataText,#metadata-line'
    : '#owner-sub-count';
  document.querySelectorAll<HTMLElement>(metricSelectors).forEach(node => {
    if (/подпис|просмотр|views?|subscribers?/i.test(node.textContent || '')) boostNode(node);
  });
  if (ownerChannelPage) boostOwnerCardCounts();
  if (ownerWatch) {
    const plain = 'a,span,yt-formatted-string,yt-attributed-string,.yt-core-attributed-string__link{text-decoration:none!important;border-bottom:0!important;-webkit-text-decoration:none!important}';
    const paint = (node: ParentNode) => {
      if (node instanceof ShadowRoot && !node.querySelector('style[data-vkvk-plain]')) {
        const style = document.createElement('style');
        style.dataset.vkvkPlain = '1';
        style.textContent = plain;
        node.append(style);
      }
      node.querySelectorAll('*').forEach(child => { if (child.shadowRoot) paint(child.shadowRoot); });
    };
    document.querySelectorAll('ytd-watch-metadata,#description,ytd-text-inline-expander').forEach(host => paint(host));
    document.querySelectorAll<HTMLElement>('#description a, ytd-text-inline-expander a, ytd-watch-metadata a, #description span, ytd-text-inline-expander span').forEach(node => {
      node.style.setProperty('text-decoration', 'none', 'important');
      node.style.setProperty('border-bottom', '0', 'important');
    });
  }
}

function viewOnlyText(value: string): boolean {
  const clean = value.replace(/\s+/g, ' ').trim();
  return Boolean(clean) && clean.length <= 140 && /^[\d\s\u00a0.,]+(?:тыс\.?|млн|млрд)?\s*просмотр/i.test(clean);
}
function clearDescBox(node: HTMLElement): void {
  node.classList.remove('vkvk-desc-text', 'vkvk-desc-skip');
  for (const property of ['display', 'width', 'margin', 'background', 'border', 'border-radius', 'padding', 'box-sizing']) node.style.removeProperty(property);
}
function decorateDescriptions(): void {
  const metadata = document.querySelector('ytd-watch-metadata');
  const root = metadata?.querySelector<HTMLElement>('ytd-text-inline-expander, ytd-expandable-video-description-body-renderer, #description');
  if (!metadata || !root) return;
  const nodes: HTMLElement[] = [];
  deepEach(root, node => {
    if (!(node instanceof HTMLElement)) return;
    if (!node.matches('yt-attributed-string, .yt-core-attributed-string, #plain-snippet-text, #attributed-snippet-text, #description-text')) return;
    if (node.closest('.vkvk-watch-views, .vkvk-desc-toggle, button')) return;
    nodes.push(node);
  });
  const scored = nodes.map(node => ({ node, text: (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim() })).filter(item => item.text);
  const body = [...scored].filter(item => !viewOnlyText(item.text)).sort((a, b) => b.text.length - a.text.length)[0]?.node
    || [...scored].sort((a, b) => b.text.length - a.text.length)[0]?.node
    || null;
  metadata.querySelectorAll<HTMLElement>('.vkvk-desc-text, .vkvk-desc-skip').forEach(node => { if (node !== body) clearDescBox(node); });
  const viewsShown = /просмотр|views/i.test(metadata.querySelector('.vkvk-watch-views')?.textContent || '');
  scored.forEach(item => {
    if (item.node !== body && viewsShown && viewOnlyText(item.text)) item.node.classList.add('vkvk-desc-skip');
  });
  if (!body) return;
  let parent: HTMLElement | null = body;
  while (parent && parent !== metadata) {
    if (parent.hasAttribute('hidden')) parent.removeAttribute('hidden');
    parent = parent.parentElement;
  }
  body.classList.add('vkvk-desc-text');
  body.classList.remove('vkvk-desc-skip');
  body.style.setProperty('display', 'block', 'important');
  body.style.setProperty('width', '100%', 'important');
  body.style.setProperty('margin', '0', 'important');
  body.style.setProperty('background', '#2c2d2e', 'important');
  body.style.setProperty('border', '1px solid #6d7074', 'important');
  body.style.setProperty('border-radius', '12px', 'important');
  body.style.setProperty('padding', '12px 14px', 'important');
  body.style.setProperty('box-sizing', 'border-box', 'important');
  let toggle = root.querySelector<HTMLButtonElement>('.vkvk-desc-toggle');
  root.querySelectorAll<HTMLButtonElement>('.vkvk-desc-toggle').forEach((extra, index) => { if (index > 0) extra.remove(); });
  if (!toggle) {
    toggle = element('button', 'vkvk-desc-toggle', 'Показать полностью');
    toggle.type = 'button';
    toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const open = root.classList.toggle('vkvk-desc-open');
      toggle!.textContent = open ? 'Свернуть' : 'Показать полностью';
    });
  }
  if (body.nextElementSibling !== toggle) body.after(toggle);
}
const otherHeaderStyle = `
:is([class*="headline" i],[class*="page-header-content" i],.ytPageHeaderViewModelHeadline){
  display:flex!important;flex-direction:row!important;align-items:flex-start!important;gap:40px!important;width:100%!important
}
:is(yt-decorated-avatar-view-model,yt-avatar-shape,#avatar,[class*="avatar-shape" i]){
  flex:none!important;width:80px!important;min-width:80px!important;height:80px!important;margin:18px 0 0 8px!important
}
:is(yt-avatar-shape,#avatar,[class*="avatar-shape" i]) img{
  width:80px!important;height:80px!important;border-radius:50%!important;object-fit:cover!important;box-shadow:0 0 0 3px #222!important
}
:is(yt-subscribe-button-view-model,ytd-subscribe-button-renderer){
  margin:22px 0 0 auto!important;flex:none!important;align-self:flex-start!important
}`;
function decorateOtherChannelAvatar(): void {
  if (contentRoute(location.pathname) !== 'channel' || isOwnerChannelPath()) return;
  const header = document.querySelector<HTMLElement>('yt-page-header-view-model, ytd-tabbed-page-header, ytd-c4-tabbed-header-renderer, #page-header');
  if (!header) return;
  paintShadows(header, otherHeaderStyle, 'other-header');
  const avatar = deepQuery<HTMLElement>(header, 'yt-decorated-avatar-view-model, yt-avatar-shape, #avatar, .yt-spec-avatar-shape');
  const avatarRow = avatar ? parentAcross(avatar) : null;
  const row = avatarRow && !avatarRow.querySelector('yt-image-banner-view-model, #header-banner, .page-header-banner') ? avatarRow : null;
  if (row) {
    row.style.setProperty('display', 'flex', 'important');
    row.style.setProperty('flex-direction', 'row', 'important');
    row.style.setProperty('align-items', 'flex-start', 'important');
    row.style.setProperty('gap', '40px', 'important');
    row.style.setProperty('width', '100%', 'important');
  }
  if (avatar) {
    avatar.style.setProperty('width', '80px', 'important');
    avatar.style.setProperty('min-width', '80px', 'important');
    avatar.style.setProperty('height', '80px', 'important');
    avatar.style.setProperty('flex', 'none', 'important');
    avatar.style.setProperty('margin', '18px 0 0 8px', 'important');
  }
  const subscribe = deepQuery<HTMLElement>(header, 'yt-subscribe-button-view-model, ytd-subscribe-button-renderer');
  if (!subscribe || subscribe.closest('.vkvk-owner-controls')) return;
  const actions = parentAcross(subscribe);
  if (row && actions && actions !== row && parentAcross(actions) === parentAcross(row)) row.append(actions);
  const target = row?.contains(subscribe) ? subscribe : actions;
  target?.style.setProperty('margin-left', 'auto', 'important');
  target?.style.setProperty('margin-top', '18px', 'important');
  target?.style.setProperty('flex', 'none', 'important');
}
const sortWord = /^(?:новые|популярные|старые|latest|popular|oldest)$/i;
function hideNativeSortChips(): void {
  if (!document.documentElement.classList.contains('vkvk-owner-videos')) return;
  const hosts = new Set<HTMLElement>();
  deepEach(document.body, node => {
    if (!(node instanceof HTMLElement) || node.closest('.vkvk-sort-chips, #vkvk-site-shell')) return;
    const label = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (!sortWord.test(label) || node.children.length > 3) return;
    let host: HTMLElement | null = node;
    for (let depth = 0; host && depth < 8; depth += 1) {
      if (host.closest('.vkvk-sort-chips, #vkvk-site-shell')) return;
      if (/^(?:YTD-BROWSE|YTD-RICH-GRID-RENDERER|YTD-PAGE-MANAGER|YTD-TWO-COLUMN-BROWSE-RESULTS-RENDERER|YTD-SECTION-LIST-RENDERER|YT-PAGE-HEADER-VIEW-MODEL)$/.test(host.tagName)) break;
      if (host.id === 'contents' || host.id === 'primary' || host.querySelector('a[href*="watch"], ytd-thumbnail, ytd-rich-item-renderer')) break;
      const text = (host.innerText || host.textContent || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
      const hits = ['новые', 'популярные', 'старые', 'latest', 'popular', 'oldest'].filter(word => text.includes(word)).length;
      const rect = host.getBoundingClientRect();
      if (hits >= 2 && text.length < 90 && (rect.height === 0 || rect.height <= 88)) hosts.add(host);
      host = parentAcross(host);
    }
  });
  hosts.forEach(host => {
    host.setAttribute('data-vkvk-native-sort', '');
    host.style.setProperty('display', 'none', 'important');
  });
}
function decorateTrendingChannels(): void {
  if (currentRoute() !== 'trending') return;
  document.querySelectorAll<HTMLElement>('ytd-video-renderer, yt-lockup-view-model').forEach(card => {
    if (card.closest('.vkvk-native-owner-promo')) return;
    const text = card.textContent?.replace(/\s+/g, ' ') || '';
    if (!/РЫЖАЯ\s*МОРДА/i.test(text) && !text.includes(ownerChannel.channelId)) return;
    card.querySelectorAll<HTMLAnchorElement>('ytd-channel-name a, #channel-name a, .ytLockupMetadataViewModelAvatar').forEach(link => {
      if (!/\/watch\?/.test(link.getAttribute('href') || '')) link.href = ownerChannel.url;
    });
    const name = [...card.querySelectorAll<HTMLElement>('ytd-channel-name, #channel-name, .ytContentMetadataViewModelMetadataText, .yt-content-metadata-view-model__metadata-text')]
      .find(node => /РЫЖАЯ\s*МОРДА/i.test(node.textContent || '') && !node.querySelector('a'));
    if (!name || name.closest('a')) return;
    const link = element('a', '', ownerChannel.name);
    link.href = ownerChannel.url;
    name.replaceChildren(link);
  });
}
function decorateLiveShelf(): void {
  const live = contentRoute(location.pathname) === 'live';
  if (!live) {
    liveEmptyTicks = 0;
    document.querySelector('.vkvk-live-head')?.remove();
    return;
  }
  if (location.pathname === '/feed/live') {
    const cards = document.querySelector('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, yt-lockup-view-model, a[href*="watch?v="]');
    if (cards) liveEmptyTicks = 0;
    else if (++liveEmptyTicks >= 6) {
      liveEmptyTicks = 0;
      location.assign(liveHubPath);
      return;
    }
  }
  const anchor = document.querySelector<HTMLElement>('ytd-browse #primary, ytd-two-column-browse-results-renderer, ytd-browse');
  if (!anchor) return;
  let head = document.querySelector<HTMLElement>('.vkvk-live-head');
  if (!head) {
    head = element('div', 'vkvk-live-head');
    head.append(element('h1', '', 'Стримы'));
    const chips = element('div', 'vkvk-live-chips');
    for (const [label, href] of [
      ['Все', liveHubPath],
      ['Видеоигры', '/gaming'],
      ['Музыка', '/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ'],
      ['Спорт', '/results?search_query=спорт&sp=EgJAAQ%3D%3D'],
    ] as const) {
      const link = element('a', location.pathname === href ? 'active' : '', label);
      link.href = href;
      chips.append(link);
    }
    head.append(chips);
  }
  if (head.parentElement !== anchor) anchor.prepend(head);
  document.querySelectorAll<HTMLElement>('ytd-thumbnail, .ytThumbnailViewModelHost, ytd-rich-grid-media #thumbnail').forEach(thumb => {
    if (thumb.closest('#vkvk-site-shell') || thumb.querySelector('.vkvk-live-label')) return;
    thumb.classList.add('vkvk-live-thumb');
    thumb.append(element('span', 'vkvk-live-label', 'LIVE'));
  });
}

function decorateChannelChrome(): void {
  if (contentRoute(location.pathname) !== 'channel') {
    document.querySelector('.vkvk-extra-tabs')?.remove();
    return;
  }
  const tabStyle = ':host,:host *{box-shadow:none!important;border-bottom:0!important}:host::after,:host::before{content:none!important;display:none!important;height:0!important}[class*="underline"],[class*="Underline"],[class*="indicator"],[class*="tab-bar"]{display:none!important;height:0!important;background:transparent!important}';
  const paintTabs = (root: ParentNode, insideTab: boolean) => {
    root.querySelectorAll<HTMLElement>('*').forEach(child => {
      const name = child.tagName.toLowerCase();
      const tabHost = insideTab || name.includes('tab') || child.id === 'tabs' || child.getAttribute('role') === 'tab' || child.getAttribute('role') === 'tablist';
      if (!child.shadowRoot || !tabHost) return;
      if (!child.shadowRoot.querySelector('style[data-vkvk-tabs]')) {
        const style = document.createElement('style');
        style.dataset.vkvkTabs = '1';
        style.textContent = tabStyle;
        child.shadowRoot.append(style);
      }
      const rect = child.getBoundingClientRect();
      if (rect.height > 0 && rect.height <= 4 && rect.width > 16) child.style.setProperty('display', 'none', 'important');
      paintTabs(child.shadowRoot, true);
    });
  };
  paintTabs(document, false);
  const header = document.querySelector<HTMLElement>('yt-page-header-view-model, ytd-tabbed-page-header, #page-header, ytd-c4-tabbed-header-renderer');
  const base = location.pathname.match(/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/)?.[0];
  if (!base || !header) return;
  const scope = header.parentElement || header;
  deepEach(scope, node => {
    if (!(node instanceof HTMLElement) || node.closest('.vkvk-extra-tabs, .vkvk-sort-chips')) return;
    const name = node.tagName.toLowerCase();
    const tabBar = name === 'yt-tab-group-shape' || name === 'tp-yt-paper-tabs' || node.id === 'tabs' || node.id === 'tabs-inner-container' || node.getAttribute('role') === 'tablist';
    if (!tabBar) return;
    const rect = node.getBoundingClientRect();
    if (rect.height === 0 || rect.height < 72) node.style.setProperty('display', 'none', 'important');
  });
  let row = document.querySelector<HTMLElement>('.vkvk-extra-tabs');
  if (!row) {
    row = element('nav', 'vkvk-extra-tabs');
    header.insertAdjacentElement('afterend', row);
  } else if (row.previousElementSibling !== header) header.insertAdjacentElement('afterend', row);
  const tabs = [
    ['Главная', base],
    ['Видео', `${base}/videos`],
    ['Клипы', `${base}/shorts`],
    ['Трансляции', `${base}/streams`],
    ['Плейлисты', `${base}/playlists`],
  ] as const;
  const current = location.pathname.replace(/\/$/, '');
  const signature = `${current}|${base}`;
  if (row.dataset.vkvkTabs === signature) return;
  row.dataset.vkvkTabs = signature;
  row.replaceChildren(...tabs.map(([label, href]) => {
    const link = element('a', current === href.replace(/\/$/, '') ? 'active' : '', label);
    link.href = href;
    return link;
  }));
}

function renderOwnerTrendCard(): void {
  const existing = document.querySelector<HTMLElement>('.vkvk-native-owner-promo');
  if (currentRoute() !== 'trending' || !ownerVideos.length) {
    existing?.remove();
    return;
  }
  if (!trendingPick || !ownerVideos.some(item => item.href === trendingPick)) {
    trendingPick = ownerVideos[Math.floor(Math.random() * ownerVideos.length)].href;
  }
  const item = ownerVideos.find(video => video.href === trendingPick);
  const contents = document.querySelector<HTMLElement>('ytd-browse #contents,ytd-section-list-renderer #contents');
  if (!item || !contents) return;
  const shownAvatar = existing?.querySelector<HTMLImageElement>('.vkvk-card-avatar')?.getAttribute('src') || '';
  if (existing?.dataset.href === item.href && existing.parentElement === contents && shownAvatar === (item.avatar || '')) return;
  existing?.remove();
  const promo = element('section', 'vkvk-native-owner-promo');
  promo.dataset.href = item.href;
  const card = vkVideoCard(item);
  card.classList.add('vkvk-trend-row');
  promo.append(element('strong', '', '№1 для вас'), card);
  contents.prepend(promo);
}

function renderOwnerHomeCards(): void {
  const existing = [...document.querySelectorAll<HTMLElement>('.vkvk-native-owner-card')];
  if (currentRoute() !== 'home' || !ownerVideos.length) {
    existing.forEach(node => node.remove());
    return;
  }
  const contents = document.querySelector<HTMLElement>('ytd-browse ytd-rich-grid-renderer #contents');
  if (!contents) return;
  existing.filter(node => node.parentElement !== contents).forEach(node => node.remove());
  const kept = existing.filter(node => node.parentElement === contents);
  const nativeCards = [...contents.children].filter(node => !(node as HTMLElement).classList.contains('vkvk-native-owner-card'));
  const nativeHrefs = new Set(
    nativeCards.flatMap(card => [...card.querySelectorAll<HTMLAnchorElement>('a[href*="/watch"]')].map(link => link.getAttribute('href') || ''))
  );
  const nativeOwnerCount = ownerVideos.filter(item => nativeHrefs.has(item.href)).length;
  const desiredTotal = nativeCards.length
    ? Math.min(ownerVideos.length, Math.max(4, Math.ceil(nativeCards.length / 6)))
    : Math.min(4, ownerVideos.length);
  const desiredInjected = Math.max(0, desiredTotal - nativeOwnerCount);
  if (kept.length >= desiredInjected) return;
  const used = new Set([...nativeHrefs, ...kept.map(node => node.dataset.href || '')]);
  const available = ownerVideos.filter(item => !used.has(item.href));
  available.slice(0, desiredInjected - kept.length).forEach((item, offset) => {
    const index = kept.length + offset;
    const wrap = element('div', 'vkvk-native-owner-card');
    wrap.dataset.href = item.href;
    wrap.append(vkVideoCard(item));
    const anchor = nativeCards[Math.min(nativeCards.length - 1, 2 + (index * 5))];
    if (anchor) anchor.after(wrap);
    else contents.append(wrap);
  });
}

function renderOwnerWatchCards(): void {
  const existing = [...document.querySelectorAll<HTMLElement>('.vkvk-owner-related-card')];
  if (currentRoute() !== 'watch' || !ownerVideos.length) {
    existing.forEach(node => node.remove());
    return;
  }
  const contents = document.querySelector<HTMLElement>(
    'ytd-watch-flexy #related #items,ytd-watch-next-secondary-results-renderer #items'
  );
  if (!contents) return;
  existing.filter(node => node.parentElement !== contents).forEach(node => node.remove());
  const kept = existing.filter(node => node.parentElement === contents);
  const nativeCards = [...contents.children].filter(node => !(node as HTMLElement).classList.contains('vkvk-owner-related-card'));
  const nativeHrefs = new Set(
    nativeCards.flatMap(card => [...card.querySelectorAll<HTMLAnchorElement>('a[href*="/watch"]')].map(link => link.getAttribute('href') || ''))
  );
  const current = `/watch?v=${new URLSearchParams(location.search).get('v') || ''}`;
  const nativeOwnerCount = ownerVideos.filter(item => nativeHrefs.has(item.href)).length;
  const desiredTotal = Math.min(6, Math.max(2, Math.ceil(nativeCards.length / 5)));
  if (nativeOwnerCount + kept.length >= desiredTotal) return;
  const used = new Set([current, ...nativeHrefs, ...kept.map(node => node.dataset.href || '')]);
  const available = ownerVideos.filter(item => !used.has(item.href));
  available.slice(0, desiredTotal - nativeOwnerCount - kept.length).forEach((item, offset) => {
    const index = nativeOwnerCount + kept.length + offset;
    const wrap = element('div', 'vkvk-owner-related-card');
    wrap.dataset.href = item.href;
    wrap.append(vkVideoCard(item));
    const anchor = nativeCards[Math.min(nativeCards.length - 1, 3 + (index * 5))];
    if (anchor) anchor.after(wrap);
    else contents.append(wrap);
  });
}

type VideoItem = {
  href: string;
  image: string;
  title: string;
  channel: string;
  meta: string;
  avatar: string;
  duration: string;
  live: boolean;
  short: boolean;
};
function imageSrc(image: HTMLImageElement): string {
  return image.currentSrc || image.src || image.getAttribute('src') || '';
}
function imageCandidates(image: HTMLImageElement): string[] {
  const fromSrcset = (image.getAttribute('srcset') || '')
    .split(',')
    .map(part => part.trim().split(/\s+/)[0])
    .filter(Boolean);
  const bg = image.style.backgroundImage.match(/url\(["']?([^"')]+)/)?.[1];
  return [image.currentSrc, image.src, image.getAttribute('src') || '', ...fromSrcset, bg || ''].filter(Boolean);
}
function usableImage(src: string): boolean {
  return Boolean(src) && !/pixel\.|1x1|blank\.gif/i.test(src);
}
function isAvatarUrl(src: string): boolean {
  return /yt3\.ggpht|googleusercontent\.com|ggpht\.com/.test(src) && !/i\.ytimg\.com/.test(src);
}
function thumbnailFor(id: string, card: HTMLElement): string {
  if (id) return `https://i.ytimg.com/vi/${id}/hq720.jpg`;
  const images = [...card.querySelectorAll<HTMLImageElement>(
    'ytd-thumbnail img,yt-thumbnail-view-model img,.ytThumbnailViewModelImage img,a[href*="/watch"] img,a[href^="/shorts/"] img,img'
  )];
  return images.flatMap(imageCandidates)
    .find(src => usableImage(src) && !src.startsWith('data:') && /ytimg\.com/.test(src) && !/yt3\.ggpht|s88-|s48-|s32-/.test(src)) || '';
}
function avatarFor(card: HTMLElement): string {
  const specific = card.querySelectorAll<HTMLImageElement>(
    'yt-decorated-avatar-view-model img,.ytLockupMetadataViewModelAvatar img,yt-avatar-stack-view-model img,.ytSpecAvatarShapeHost img,yt-avatar-shape img,#avatar-link img,yt-img-shadow img,#channel-thumbnail img'
  );
  for (const image of specific) {
    const picked = imageCandidates(image).find(src => usableImage(src) && (isAvatarUrl(src) || src.startsWith('data:')));
    if (picked && !/i\.ytimg\.com/.test(picked)) return picked;
  }
  return [...card.querySelectorAll<HTMLImageElement>('img')].flatMap(imageCandidates)
    .find(src => usableImage(src) && isAvatarUrl(src)) || '';
}
function cardTitle(card: HTMLElement, link: HTMLAnchorElement | null): string {
  const titled = card.querySelector<HTMLElement>(
    '#video-title[title],h3[title],a[title][href*="/watch"],a[title][href^="/shorts/"],.ytLockupMetadataViewModelTitle[title]'
  );
  const text = card.querySelector<HTMLElement>(
    '#video-title,h3,.ytLockupMetadataViewModelTitle,.yt-lockup-metadata-view-model__title,.yt-lockup-metadata-view-model-wiz__title'
  );
  return titled?.getAttribute('title')?.trim()
    || text?.getAttribute('title')?.trim()
    || text?.textContent?.replace(/\s+/g, ' ').trim()
    || link?.getAttribute('title')?.trim()
    || link?.getAttribute('aria-label')?.replace(/^\d+:\d+(?::\d+)?\s+/, '').trim()
    || link?.textContent?.replace(/\s+/g, ' ').trim()
    || '';
}
function subscriptionAvatarMap(): Map<string, string> {
  const map = new Map<string, string>();
  shell?.querySelectorAll<HTMLAnchorElement>('.vkvk-subscriptions .vkvk-subscription').forEach(link => {
    const name = link.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const src = link.querySelector('img')?.src || '';
    if (name && src) map.set(name, src);
  });
  return map;
}
function nativeVideoItems(root: ParentNode = document, includeShorts = false): VideoItem[] {
  const result: VideoItem[] = [];
  const seen = new Set<string>();
  const avatars = subscriptionAvatarMap();
  const cards = root.querySelectorAll<HTMLElement>(
    `yt-lockup-view-model,ytd-rich-grid-media,ytd-grid-video-renderer,ytd-video-renderer,ytd-playlist-video-renderer${includeShorts ? ',shorts-lockup-view-model,ytm-shorts-lockup-view-model' : ''}`
  );
  for (const card of cards) {
    if (card.closest('#vkvk-site-shell,ytd-watch-flexy,#secondary,#related,ytd-watch-next-secondary-results-renderer,ytd-playlist-panel-renderer')) continue;
    const link = card.querySelector<HTMLAnchorElement>('a[href*="/watch"],a[href^="/shorts/"]');
    const title = cardTitle(card, link);
    const href = link?.getAttribute('href') || '';
    const id = href.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] || href.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)?.[1];
    const imageUrl = id ? thumbnailFor(id, card) : '';
    if (!href || !id || !imageUrl || !title || seen.has(id)) continue;
    seen.add(id);
    const rows = [...new Set([...card.querySelectorAll<HTMLElement>(
      '.ytContentMetadataViewModelMetadataRow,#metadata-line,.shortsLockupViewModelHostMetadataSubhead'
    )].map(row => row.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean))];
    const channelNode = card.querySelector<HTMLAnchorElement>(
      'ytd-channel-name a,.ytContentMetadataViewModelMetadataRow a[href^="/@"],.ytContentMetadataViewModelMetadataRow a[href^="/channel/"],a.yt-core-attributed-string__link[href^="/@"]'
    );
    const explicitChannel = channelNode?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const channel = explicitChannel || rows[0] || '';
    const channelKey = channelNode?.getAttribute('href') || channel;
    const metaRows = (explicitChannel ? rows : rows.slice(1))
      .map(row => explicitChannel && row.startsWith(explicitChannel)
        ? row.slice(explicitChannel.length).replace(/^[\s·•|,-]+/, '').trim()
        : row)
      .filter(row => row && row !== channel);
    const meta = [...new Set(metaRows)].join(' · ');
    const cardText = card.textContent || '';
    const avatar = avatarFor(card);
    if (channelKey && avatar) avatars.set(channelKey, avatar);
    if (channel && avatar) avatars.set(channel, avatar);
    result.push({
      href: href.startsWith('/shorts/') ? `/shorts/${id}` : `/watch?v=${id}`,
      image: imageUrl, title, channel, meta, avatar,
      duration: card.querySelector<HTMLElement>(
        '.ytBadgeShapeText,ytd-thumbnail-overlay-time-status-renderer #text'
      )?.textContent?.trim() || '',
      live: /\bLIVE\b|В ЭФИРЕ|СМОТРЯТ СЕЙЧАС|СМОТРИТ СЕЙЧАС/i.test(cardText),
      short: href.startsWith('/shorts/'),
    });
  }
  for (const item of result) {
    if (!item.avatar && item.channel) item.avatar = avatars.get(item.channel) || '';
  }
  return result;
}
function vkVideoCard(item: VideoItem): HTMLElement {
  const card = element('article', `vkvk-catalog-card${item.short ? ' vkvk-short-card' : ''}`);
  const media = element('a', 'vkvk-catalog-media');
  media.href = item.href;
  const image = element('img');
  image.src = item.image;
  image.alt = '';
  image.loading = 'lazy';
  image.addEventListener('error', () => {
    if (image.src.includes('/hq720.jpg')) image.src = image.src.replace('/hq720.jpg', '/sddefault.jpg');
    else if (image.src.includes('/sddefault.jpg')) image.src = image.src.replace('/sddefault.jpg', '/hqdefault.jpg');
  });
  media.append(image);
  if (item.live) {
    media.append(element('span', 'vkvk-live-play', '▶'));
    media.append(element('span', 'vkvk-live-label', 'LIVE'));
  }
  if (item.duration) media.append(element('span', 'vkvk-duration', item.duration));
  const body = element('div', 'vkvk-catalog-body');
  const channelHref = item.channel === ownerChannel.name ? ownerChannel.url : '';
  const avatar = item.avatar ? element('img', 'vkvk-card-avatar') : item.channel ? element('span', 'vkvk-card-avatar vkvk-card-avatar-fallback') : null;
  if (avatar instanceof HTMLImageElement) {
    avatar.src = item.avatar;
    avatar.alt = '';
  }
  if (avatar && channelHref) {
    const avatarLink = element('a', 'vkvk-card-avatar-link');
    avatarLink.href = channelHref;
    avatarLink.append(avatar);
    body.append(avatarLink);
  } else if (avatar) body.append(avatar);
  const copy = element('div', 'vkvk-card-copy');
  const title = element('a', 'vkvk-card-title', item.title);
  title.href = item.href;
  copy.append(title);
  if (item.channel && channelHref) {
    const channel = element('a', 'vkvk-card-channel', item.channel);
    channel.href = channelHref;
    copy.append(channel);
  } else if (item.channel) copy.append(element('div', 'vkvk-card-channel', item.channel));
  if (item.meta) copy.append(element('div', 'vkvk-card-meta', item.meta));
  body.append(copy, cardMenu(item));
  card.append(media, body);
  return card;
}
function cardMenu(item: VideoItem): HTMLElement {
  const wrap = element('div', 'vkvk-card-menu');
  const button = element('button', 'vkvk-card-more');
  button.type = 'button';
  button.setAttribute('aria-label', 'Ещё');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4m0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4m0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4"/></svg>';
  const menu = element('div', 'vkvk-card-popover');
  menu.hidden = true;
  const watch = element('a', '', 'Смотреть');
  watch.href = item.href;
  const copyLink = element('button', '', 'Скопировать ссылку');
  copyLink.type = 'button';
  copyLink.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const url = new URL(item.href, location.origin).href;
    if (navigator.clipboard) void navigator.clipboard.writeText(url);
    menu.hidden = true;
  });
  const channel = element('a', '', 'Открыть канал');
  channel.href = ownerChannel.url;
  menu.append(watch, copyLink, channel);
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const open = menu.hidden;
    document.querySelectorAll<HTMLElement>('.vkvk-card-popover').forEach(node => { node.hidden = true; });
    menu.hidden = !open;
  });
  wrap.append(button, menu);
  return wrap;
}

function renderWatchHeading(): void {
  const existingHeading = document.getElementById('vkvk-recommend-heading');
  if (contentRoute(location.pathname) !== 'watch') {
    existingHeading?.remove();
    return;
  }
  const host = document.querySelector<HTMLElement>('ytd-watch-flexy #secondary-inner');
  if (!host) return;
  let heading = existingHeading;
  if (!heading) {
    heading = element('div', 'vkvk-recommend-heading');
    heading.id = 'vkvk-recommend-heading';
    heading.append(element('strong', '', 'Смотрите также'));
    const all = element('button', 'vkvk-all-videos', 'Все видео');
    all.type = 'button';
    all.addEventListener('click', () => {
      const current = document.querySelector<HTMLElement>('ytd-watch-flexy #secondary-inner') || host;
      const chip = [...current.querySelectorAll<HTMLElement>('button,yt-chip-cloud-chip-renderer,chip-shape')]
        .find(node => /^все(?:\s+видео)?$/i.test(node.textContent?.replace(/\s+/g, ' ').trim() || ''));
      chip?.click();
    });
    heading.append(all);
  }
  const playlist = host.querySelector<HTMLElement>('ytd-playlist-panel-renderer:not([hidden]):not([data-vkvk-invalid]),#playlist:not([hidden])');
  const related = host.querySelector<HTMLElement>('#related,ytd-watch-next-secondary-results-renderer,yt-related-chip-cloud-renderer');
  if (related) related.before(heading);
  else if (playlist) playlist.after(heading);
  else if (!heading.isConnected) host.append(heading);
  const chips = host.querySelector<HTMLElement>('yt-related-chip-cloud-renderer');
  if (chips && chips.previousElementSibling !== heading) heading.after(chips);
  const markAuthor = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement>('button,yt-chip-cloud-chip-renderer,chip-shape').forEach(node => {
      const label = node.textContent?.replace(/\s+/g, ' ').trim() || '';
      node.classList.toggle('vkvk-author-chip', /^автор\b/i.test(label));
      if (node.shadowRoot) markAuthor(node.shadowRoot);
    });
  };
  markAuthor(host);
}

function showRecsysToast(): void {
  const route = currentRoute();
  const surface = route === 'watch' ? 'video' : route === 'home' ? 'feed' : '';
  const toast = document.getElementById('vkvk-recsys-toast');
  if (!surface) {
    toast?.classList.remove('vkvk-recsys-toast--show');
    toast?.setAttribute('hidden', '');
    return;
  }
  const key = `vkvk-recsys-toast-${surface}`;
  if (sessionStorage.getItem(key)) return;
  let node = toast;
  if (!node) {
    node = element('div', 'vkvk-recsys-toast');
    node.id = 'vkvk-recsys-toast';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    const hide = () => {
      const current = node?.dataset.vkvkSurface || surface;
      node?.classList.remove('vkvk-recsys-toast--show');
      node?.setAttribute('hidden', '');
      sessionStorage.setItem(`vkvk-recsys-toast-${current}`, '1');
    };
    const close = element('button', 'vkvk-recsys-toast-close', '×');
    close.type = 'button';
    close.id = 'vkvk-recsys-toast-close';
    close.setAttribute('aria-label', 'Закрыть');
    close.addEventListener('click', event => {
      event.preventDefault();
      hide();
    });
    const ico = element('span', 'vkvk-recsys-toast-ico', 'i');
    ico.setAttribute('aria-hidden', 'true');
    const body = element('div', 'vkvk-recsys-toast-body');
    body.append(element('div', 'vkvk-recsys-toast-title', 'Применяются рекомендательные технологии'));
    const more = element('button', 'vkvk-recsys-toast-more', 'Подробнее');
    more.type = 'button';
    more.addEventListener('click', () => {
      let legal = document.getElementById('vkvk-recsys-legal');
      if (!legal) {
        legal = element('div', 'vkvk-recsys-legal');
        legal.id = 'vkvk-recsys-legal';
        legal.innerHTML = '<strong>Правила рекомендательных технологий</strong><p>Рекомендации на этой странице строит YouTube по просмотрам, подпискам и похожим роликам. Расширение только оформляет интерфейс в стиле VK Видео и не подменяет выдачу.</p>';
        const done = element('button', '', 'Понятно');
        done.type = 'button';
        done.addEventListener('click', () => legal?.remove());
        legal.append(done);
        document.body.append(legal);
      }
    });
    body.append(more);
    node.append(close, ico, body);
    node.addEventListener('mouseenter', () => node?.classList.add('vkvk-recsys-toast--hover'));
    node.addEventListener('mouseleave', () => node?.classList.remove('vkvk-recsys-toast--hover'));
    document.body.append(node);
  }
  if (node.dataset.vkvkSurface === surface && node.dataset.vkvkArmed) return;
  node.dataset.vkvkSurface = surface;
  node.dataset.vkvkArmed = '1';
  node.removeAttribute('hidden');
  window.clearTimeout(recsysShowTimer);
  window.clearTimeout(recsysHideTimer);
  recsysShowTimer = window.setTimeout(() => {
    if (contentRoute(location.pathname) !== (surface === 'video' ? 'watch' : 'home')) return;
    node?.classList.add('vkvk-recsys-toast--show');
    recsysHideTimer = window.setTimeout(() => {
      node?.classList.remove('vkvk-recsys-toast--show');
      node?.setAttribute('hidden', '');
      sessionStorage.setItem(key, '1');
    }, 8000);
  }, surface === 'video' ? 1200 : 1600);
}
function catalogChips(): HTMLElement {
  const chips = element('div', 'vkvk-catalog-chips');
  for (const [index, label] of ['Все', 'Интервью и шоу', 'Политика', 'Музыка', 'Путешествия', 'Авто', 'Технологии', 'Еда', 'Образование', 'Мода и красота', 'Здоровье', 'Культура'].entries()) {
    const chip = element('button', index === 0 ? 'active' : '', label);
    chip.type = 'button';
    if (index) chip.addEventListener('click', () => search(label));
    chips.append(chip);
  }
  return chips;
}
function channelHeader(): HTMLElement | null {
  const native = document.querySelector<HTMLElement>(
    'yt-page-header-view-model,ytd-tabbed-page-header,ytd-c4-tabbed-header-renderer'
  );
  if (!native) return null;
  const wrap = element('section', 'vkvk-channel-header');
  const bannerSrc = native.querySelector<HTMLImageElement>(
    '#page-header-banner img,yt-image-banner-view-model img,#channel-header img'
  )?.src;
  if (bannerSrc) {
    const banner = element('img', 'vkvk-channel-banner');
    banner.src = bannerSrc;
    banner.alt = '';
    wrap.append(banner);
  }
  const info = element('div', 'vkvk-channel-info');
  const avatarSrc = native.querySelector<HTMLImageElement>(
    'yt-avatar-shape img,#avatar img,.yt-spec-avatar-shape__image'
  )?.src;
  if (avatarSrc) {
    const avatar = element('img', 'vkvk-channel-avatar');
    avatar.src = avatarSrc;
    avatar.alt = '';
    info.append(avatar);
  }
  const text = element('div', 'vkvk-channel-copy');
  const fullHeaderText = native.textContent?.replace(/\s+/g, ' ').trim() || '';
  const fallbackMeta = [...fullHeaderText.matchAll(
    /@[\w.-]+|[\d.,]+\s*(?:тыс\.?|млн|млрд|K|M|B)?\s*(?:подписчик\w*|subscribers?)|[\d.,]+\s*(?:тыс\.?|K)?\s*(?:видео|videos?)/giu
  )].slice(0, 3).map(match => match[0]).join(' · ');
  text.append(
    element('h1', '', native.querySelector<HTMLElement>('h1,#channel-name,#text')?.textContent?.trim() || 'Канал'),
    element('div', 'vkvk-channel-meta', native.querySelector<HTMLElement>(
      '#subscriber-count,#channel-handle,.yt-content-metadata-view-model__metadata-row'
    )?.textContent?.replace(/\s+/g, ' ').trim() || fallbackMeta),
  );
  const description = native.querySelector<HTMLElement>(
    '#description,.yt-description-preview-view-model-wiz__description,yt-description-preview-view-model'
  )?.textContent?.replace(/\s+/g, ' ').trim();
  if (description) text.append(element('div', 'vkvk-channel-description', description.replace(/…ещё.*$/i, '')));
  info.append(text);
  const subscribe = element('button', 'vkvk-channel-subscribe', 'Подписаться');
  subscribe.type = 'button';
  subscribe.addEventListener('click', () => clickNative(
    'yt-subscribe-button-view-model button,ytd-subscribe-button-renderer button'
  ));
  info.append(subscribe);
  wrap.append(info);
  const tabs = element('nav', 'vkvk-channel-tabs');
  const base = location.pathname.match(/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+)/)?.[0] || location.pathname;
  for (const [label, suffix] of [['Главная', ''], ['Видео', '/videos'], ['Клипы', '/shorts'], ['Трансляции', '/streams'], ['Плейлисты', '/playlists']]) {
    const link = element('a', location.pathname === `${base}${suffix}` ? 'active' : '', label);
    link.href = `${base}${suffix}`;
    tabs.append(link);
  }
  wrap.append(tabs);
  return wrap;
}
function refreshCatalog(): void {
  if (!shell) return;
  const route = currentRoute();
  let host = shell.querySelector<HTMLElement>('.vkvk-catalog');
  if (!ownerRequested) {
    ownerRequested = true;
    void loadOwnerCatalog().then(result => {
      ownerVideos = result.videos;
      catalogKey = '';
      refreshCatalog();
      renderOwnerTrendCard();
      renderOwnerHomeCards();
      renderOwnerWatchCards();
    });
  }
  if (!catalogSupported()) {
    dropCustomCatalog();
    return;
  }
  const includeChannelShorts = route === 'channel'
    && (location.pathname.endsWith('/shorts') || location.pathname.match(/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+)$/) !== null);
  let items = nativeVideoItems(document, includeChannelShorts);
  const homeShorts = route === 'home' ? nativeVideoItems(document, true).filter(item => item.short) : [];
  if (route === 'home') items = mixOwnerVideos(items, ownerVideos, 'home');
  const header = route === 'channel' ? channelHeader() : null;
  const channelAvatar = header?.querySelector<HTMLImageElement>('.vkvk-channel-avatar')?.src || '';
  if (channelAvatar) items.forEach(item => { if (!item.avatar) item.avatar = channelAvatar; });
  const listPage = route === 'playlist' || route === 'playlists';
  if (!items.length && !homeShorts.length && !listPage) {
    dropCustomCatalog();
    return;
  }
  const key = `${location.href}|${[...items, ...homeShorts].map(item => item.href + item.image + item.avatar).join('|')}|${header?.innerHTML || ''}`;
  if (key === catalogKey && host?.isConnected) return;
  catalogKey = key;
  if (!host) {
    host = element('main', 'vkvk-catalog');
    shell.append(host);
  }
  host.replaceChildren();
  if (route === 'channel') {
    if (header) host.append(header);
  } else if (route === 'subscriptions') {
    const subscriptions = element('section', 'vkvk-subscriptions-page');
    const top = element('div', 'vkvk-subscriptions-title');
    top.append(element('strong', '', 'Подписки'));
    const manage = element('a', '', 'Управление подписками');
    manage.href = '/feed/channels';
    top.append(manage);
    subscriptions.append(top);
    const channels = element('div', 'vkvk-subscriptions-row');
    shell.querySelectorAll<HTMLAnchorElement>('.vkvk-subscriptions .vkvk-subscription').forEach(source => {
      const link = element('a', 'vkvk-subscriptions-channel');
      link.href = source.href;
      const image = source.querySelector<HTMLImageElement>('img');
      if (image) {
        const avatar = element('img');
        avatar.src = image.src;
        avatar.alt = '';
        link.append(avatar);
      }
      link.append(element('span', '', source.querySelector('span')?.textContent || 'Канал'));
      channels.append(link);
    });
    subscriptions.append(channels);
    host.append(subscriptions);
  } else if (listPage) {
    const title = element('div', 'vkvk-list-heading');
    title.append(element('strong', '', playlistPageTitle()));
    host.append(title);
    if (!items.length) host.append(element('p', 'vkvk-empty-list', 'Здесь пока нет видео'));
  } else {
    host.append(catalogChips());
  }
  const channelBase = location.pathname.match(/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+)/)?.[0];
  const isChannelHome = route === 'channel' && channelBase === location.pathname;
  const shelves = isChannelHome
    ? [...document.querySelectorAll<HTMLElement>('ytd-shelf-renderer,ytd-rich-section-renderer')]
      .map(shelf => ({
        title: shelf.querySelector<HTMLElement>('#title,h2,h3')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        items: nativeVideoItems(shelf, true),
      }))
      .filter(section => section.items.length > 0)
    : [];
  if (shelves.length) {
    const used = new Set<string>();
    for (const section of shelves) {
      const unique = section.items.filter(item => !used.has(item.href) && used.add(item.href));
      if (!unique.length) continue;
      const block = element('section', 'vkvk-channel-section');
      block.append(element('h2', '', section.title || 'Видео'));
      const grid = element('div', 'vkvk-catalog-grid');
      grid.replaceChildren(...unique.map(vkVideoCard));
      block.append(grid);
      host.append(block);
    }
  } else {
    const grid = element('section', `vkvk-catalog-grid${location.pathname.endsWith('/shorts') ? ' vkvk-clips-grid' : ''}`);
    grid.replaceChildren(...items.map(vkVideoCard));
    host.append(grid);
  }
  if (route === 'home' && homeShorts.length) {
    const clips = element('section', 'vkvk-home-clips');
    clips.append(element('h2', '', 'Клипы'));
    const grid = element('div', 'vkvk-catalog-grid vkvk-clips-grid');
    grid.replaceChildren(...homeShorts.slice(0, 14).map(vkVideoCard));
    clips.append(grid);
    host.append(clips);
  }
  document.documentElement.classList.add('vkvk-custom-catalog');
}

function updateActive(): void {
  if (!shell) return;
  const route = currentRoute();
  const list = new URLSearchParams(location.search).get('list');
  const active = list === 'WL' ? 'watch-later' : list === 'LL' ? 'liked' : route === 'trending' ? 'trending'
    : location.pathname === '/feed/playlists' ? 'playlists' : location.pathname === '/feed/channels' ? 'channels' : route;
  shell.querySelectorAll<HTMLElement>('.vkvk-nav[data-route]').forEach(item => item.classList.toggle('active', item.dataset.route === active));
  const input = shell.querySelector<HTMLInputElement>('.vkvk-search input');
  if (input && document.activeElement !== input) {
    if (route === 'search') input.value = new URLSearchParams(location.search).get('search_query') || '';
    const hint = route === 'history' ? 'Поиск в истории просмотра' : 'Поиск видео';
    input.placeholder = hint;
    input.setAttribute('aria-label', hint);
  }
}

let addedDark = false;
function forceDarkTheme(): void {
  const root = document.documentElement;
  if (root.hasAttribute('dark')) return;
  root.setAttribute('dark', '');
  addedDark = true;
}
function refresh(): void {
  if (!enabled) return;
  syncFullscreen();
  forceDarkTheme();
  if (shell && !shell.isConnected) shell = null;
  renderShell();
  const urlChanged = location.href !== lastUrl;
  if (urlChanged) {
    lastUrl = location.href;
    document.documentElement.dataset.vkvkRoute = currentRoute();
    document.documentElement.dataset.vkvkPage = 'site';
    toggleProfileMenu(false);
    document.documentElement.classList.remove('vkvk-side-overlay');
    document.documentElement.classList.toggle('vkvk-watch-side-expanded', contentRoute(location.pathname) === 'watch' && watchSideExpanded);
    if (!catalogSupported()) dropCustomCatalog();
    if (contentRoute(location.pathname) === 'watch') nudgePlayerLayout();
  }
  updateActive();
  syncTabBrand();
  syncAccount();
  stabilizeWatchViews();
  syncLikeHearts();
  const now = performance.now();
  if (now - lastHeavyRefresh >= 450 || urlChanged) {
    lastHeavyRefresh = now;
    syncSubscriptions();
    decorateCards();
    localizeYouTubeLabels();
    decorateWatchPlayer();
    decorateAdSkip();
    decorateDescriptions();
    decorateOtherChannelAvatar();
    decorateLiveShelf();
    decorateTrendingChannels();
    decorateOwnerMode();
    decorateChannelChrome();
    showRecsysToast();
    focusShorts();
    renderRussiaFeed();
    pinShell();
    refreshCatalog();
    renderOwnerTrendCard();
    renderOwnerHomeCards();
    renderOwnerWatchCards();
    renderWatchHeading();
  }
}
function schedule(immediate = false): void {
  if (scheduled) return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    refreshTimer = 0;
    requestAnimationFrame(refresh);
  };
  if (immediate) run();
  else refreshTimer = window.setTimeout(run, 120);
}
function setEnabled(value: boolean): void {
  enabled = value;
  document.documentElement.classList.toggle('vkvk-site', value);
  if (value) { installFonts(); lastUrl = ''; schedule(); return; }
  shell?.remove();
  shell = null;
  catalogKey = '';
  document.documentElement.classList.remove('vkvk-custom-catalog');
  if (addedDark) { document.documentElement.removeAttribute('dark'); addedDark = false; }
  document.querySelectorAll('.vkvk-inline-avatar').forEach(node => node.remove());
  document.querySelectorAll('[data-vkvk-avatar]').forEach(node => node.removeAttribute('data-vkvk-avatar'));
  delete document.documentElement.dataset.vkvkPage;
  delete document.documentElement.dataset.vkvkRoute;
}

void preferences().then(state => {
  watchSideExpanded = state.sideExpanded;
  youtubeInRussia = state.youtubeInRussia;
  applyVidiqVisibility(state.hideVidiq);
  setEnabled(state.siteEnabled);
});
chrome.storage.onChanged.addListener(changes => {
  if (changes.siteEnabled) setEnabled(Boolean(changes.siteEnabled.newValue));
  if (changes.hideVidiq) applyVidiqVisibility(Boolean(changes.hideVidiq.newValue));
  if (changes.youtubeInRussia) {
    youtubeInRussia = Boolean(changes.youtubeInRussia.newValue);
    renderRussiaFeed();
  }
  if (changes.sideExpanded) {
    watchSideExpanded = Boolean(changes.sideExpanded.newValue);
    document.documentElement.classList.toggle('vkvk-watch-side-expanded', watchSideExpanded && contentRoute(location.pathname) === 'watch');
    nudgePlayerLayout();
  }
});
function feedIsLoading(): boolean {
  const node = document.querySelector<HTMLElement>('ytd-continuation-item-renderer');
  if (!node || node.hasAttribute('hidden') || node.offsetParent === null) return false;
  const rect = node.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > window.innerHeight - 280;
}
let lastFeedScroll = 0;
let correctingFeedScroll = false;
function keepFeedScroll(): void {
  lastFeedScroll = window.scrollY;
  window.addEventListener('wheel', event => {
    if (!enabled || !feedIsLoading() || event.deltaY <= 28) return;
    event.preventDefault();
    window.scrollBy(0, Math.min(event.deltaY, 24));
  }, { passive: false, capture: true });
  window.addEventListener('scroll', () => {
    if (correctingFeedScroll) return;
    const y = window.scrollY;
    if (window.scrollX !== 0) window.scrollTo(0, y);
    const drop = y - lastFeedScroll;
    if (feedIsLoading() && drop > window.innerHeight * 0.55) {
      correctingFeedScroll = true;
      window.scrollTo(0, lastFeedScroll);
      correctingFeedScroll = false;
      return;
    }
    lastFeedScroll = window.scrollY;
  }, { passive: true });
}
keepFeedScroll();
document.addEventListener('yt-navigate-finish', () => schedule(true));
document.addEventListener('fullscreenchange', () => { syncFullscreen(); schedule(true); });
document.addEventListener('webkitfullscreenchange', () => { syncFullscreen(); schedule(true); });
window.addEventListener('popstate', () => schedule(true));
window.addEventListener('keydown', event => {
  if (!enabled || contentRoute(location.pathname) !== 'watch') return;
  if (event.ctrlKey || event.metaKey || event.altKey || (event.key.toLocaleLowerCase() !== 't' && event.code !== 'KeyT')) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}, true);
document.addEventListener('click', event => {
  const target = event.target;
  if (target instanceof Element && target.closest('.vkvk-card-menu')) return;
  document.querySelectorAll<HTMLElement>('.vkvk-card-popover').forEach(menu => { menu.hidden = true; });
  if (target instanceof Element && target.closest('.ytp-settings-button')) {
    window.setTimeout(filterPlayerSettings, 0);
    window.setTimeout(filterPlayerSettings, 80);
  }
});
new MutationObserver(records => {
  if (records.every(record => record.target.parentElement?.closest('#vkvk-site-shell, .vkvk-watch-views'))) return;
  const relevantSelector = [
    'ytd-app', 'ytd-page-manager', 'yt-lockup-view-model', 'shorts-lockup-view-model', 'ytm-shorts-lockup-view-model', 'ytd-rich-grid-media',
    'ytd-grid-video-renderer', 'ytd-video-renderer', 'ytd-rich-item-renderer',
    'yt-page-header-view-model', 'ytd-tabbed-page-header', 'ytd-c4-tabbed-header-renderer',
    'ytd-guide-entry-renderer', 'ytd-masthead', 'ytd-watch-metadata', 'ytd-comments-header-renderer',
    'ytd-playlist-panel-renderer', '.ytp-settings-menu', '.ytp-panel-menu', '.ytp-menuitem',
  ].join(',');
  const relevant = records.some(record => {
    if (record.type === 'characterData') {
      const parent = record.target.parentElement;
      if (!parent || parent.closest('.vkvk-watch-views, #vkvk-site-shell')) return false;
      return Boolean(parent.closest('ytd-watch-metadata, like-button-view-model, #view-count, .view-count, ytd-watch-info-text'));
    }
    if (record.type === 'attributes') {
      return Boolean((record.target as Element).closest(
        'yt-lockup-view-model,shorts-lockup-view-model,ytm-shorts-lockup-view-model,ytd-rich-grid-media,ytd-grid-video-renderer,ytd-video-renderer,yt-page-header-view-model,ytd-tabbed-page-header,like-button-view-model,#view-count,.view-count'
      ));
    }
    return [...record.addedNodes, ...record.removedNodes].some(changed =>
      changed instanceof Element
      && (changed.matches(relevantSelector) || Boolean(changed.querySelector(relevantSelector)))
    );
  });
  if (!relevant) return;
  schedule();
}).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'href', 'title', 'aria-pressed'] });
const titleNode = document.querySelector('title');
if (titleNode) new MutationObserver(() => { if (enabled) syncTabBrand(); }).observe(titleNode, { childList: true });
