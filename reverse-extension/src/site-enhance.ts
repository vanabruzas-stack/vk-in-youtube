type GuideItem = { label: string; icon: string; href: string; target?: string; avatar?: string };

const icons: Record<string, string> = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  shorts: '<path d="M15.6 2.7 7.4 7.4a4 4 0 0 0-1.5 5.4 4 4 0 0 0 5.4 1.5l5.3-3a4 4 0 0 1-1.5 5.4l-6.7 3.8"/><path d="m10 9 5 3-5 3z"/>',
  subscriptions: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M6 5h12M8 2h8m-5 9 5 3-5 3z"/>',
  user: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="9" r="3"/><path d="M5.3 19a7 7 0 0 1 13.4 0"/>',
  history: '<path d="M3 8V3m0 5h5M3 8a9 9 0 1 1-1 7"/><path d="M12 7v5l3 2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  like: '<path d="M8 10 11 3c.5-1 2-1 2.5 0l.2 1.2L13 9h6a2 2 0 0 1 2 2l-1 8a2 2 0 0 1-2 2H8zm0 0v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"/>',
  dislike: '<path d="M8 14 11 21c.5 1 2 1 2.5 0l.2-1.2L13 15h6a2 2 0 0 0 2-2l-1-8a2 2 0 0 0-2-2H8zm0 0V3H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2z"/>',
  playlist: '<path d="M3 5h13M3 10h13M3 15h9m4-3v9m-4-5h8"/>',
  trend: '<path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-6-.5 2-2 3-3 3 0-3-1-7-4-10 0 4-4 6-4 12 0 5 3 8 7 8z"/>',
  music: '<path d="M9 18V5l12-2v13M9 7l12-2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  live: '<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9m9-9a6.4 6.4 0 0 1 0 9M4 4a11.3 11.3 0 0 0 0 16m16-16a11.3 11.3 0 0 1 0 16"/>',
  kids: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/>',
  studio: '<path d="M4 4h16v16H4zM7 16l3-4 3 2 4-5"/>',
};

function svg(name: string, size = 24): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function nativeHref(id: string, fallback: string): { href: string; target?: string } {
  const anchor = document.querySelector<HTMLAnchorElement>(`a[data-testid="${id}"]`);
  return { href: anchor?.href || fallback, target: anchor?.target || undefined };
}

function appendSection(guide: HTMLElement, title: string | null, items: GuideItem[]): void {
  const section = document.createElement('section');
  section.className = 'vky-guide-section';
  if (title) {
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading);
  }
  for (const item of items) {
    const anchor = document.createElement('a');
    anchor.className = 'vky-guide-link';
    anchor.href = item.href;
    anchor.dataset.label = item.label;
    anchor.title = item.label;
    if (item.target) { anchor.target = item.target; anchor.rel = 'noopener noreferrer'; }
    const icon = document.createElement('span');
    icon.className = 'vky-guide-icon';
    if (item.avatar) {
      const image = document.createElement('img');
      image.src = item.avatar;
      image.alt = '';
      icon.append(image);
    } else icon.innerHTML = svg(item.icon);
    const text = document.createElement('span');
    text.className = 'vky-guide-label';
    text.textContent = item.label;
    anchor.append(icon, text);
    section.append(anchor);
  }
  guide.append(section);
}

let lastGuideSignature = '';
function guideItems(live: boolean): [string | null, GuideItem[]][] {
  const playlist = nativeHref('main_menu_my_playlists', 'https://vkvideo.ru/playlist');
  const channel = playlist.href.match(/https?:\/\/[^/]+\/@[^/]+/)?.[0] || 'https://vkvideo.ru/history';
  const base: [string | null, GuideItem[]][] = [
    [null, [
      { label: 'Главная', icon: 'home', ...nativeHref('main_menu_trends', 'https://vkvideo.ru/') },
      { label: 'Shorts', icon: 'shorts', ...nativeHref('main_menu_clips', 'https://vkvideo.ru/clips') },
      { label: 'Подписки', icon: 'subscriptions', ...nativeHref('main_menu_subscribes', 'https://vkvideo.ru/subscriptions') },
      { label: 'Вы', icon: 'user', href: channel },
      { label: 'История', icon: 'history', ...nativeHref('main_menu_my_history', 'https://vkvideo.ru/history') },
    ]],
    ['Вы', [
      { label: 'Смотреть позже', icon: 'clock', ...nativeHref('main_menu_my_bookmarks', 'https://vkvideo.ru/bookmarks') },
      { label: 'Понравившиеся', icon: 'like', ...nativeHref('main_menu_my_liked', 'https://vkvideo.ru/liked') },
      { label: 'Плейлисты', icon: 'playlist', ...playlist },
    ]],
    ['Навигатор', [
      { label: 'В тренде', icon: 'trend', ...nativeHref('main_menu_popular_trends', 'https://vkvideo.ru/trends') },
      { label: 'Музыка', icon: 'music', ...nativeHref('main_menu_musical', 'https://vkvideo.ru/musical') },
      { label: 'Трансляции', icon: 'live', ...nativeHref('main_menu_vk_live', 'https://live.vkvideo.ru/') },
      { label: 'YouTube Детям', icon: 'kids', ...nativeHref('main_menu_for_kids', 'https://vkvideo.ru/for_kids') },
    ]],
    ['Другие возможности', [
      { label: 'YouTube Studio', icon: 'studio', ...nativeHref('main_menu_authors_cabinet', 'https://cabinet.vkvideo.ru/dashboard') },
    ]],
  ];
  const nativeSubscriptions = live
    ? [...document.querySelectorAll<HTMLAnchorElement>('a[class*="ChannelsItem_container"]')].slice(0, 8)
    : [...document.querySelectorAll<HTMLAnchorElement>('a[data-testid^="main_menu_block_"]')].slice(0, 8);
  const subscriptions = nativeSubscriptions.map(anchor => ({
    label: anchor.textContent?.trim().replace(/\s+/g, ' ').slice(0, 34) || 'Канал',
    icon: 'subscriptions', href: anchor.href, avatar: anchor.querySelector('img')?.src,
  }));
  if (subscriptions.length) base.push(['Подписки', subscriptions]);
  return base;
}

function mountGuide(live: boolean): void {
  if (!document.body) return;
  let guide = document.getElementById('vky-guide');
  if (!guide) {
    guide = document.createElement('aside');
    guide.id = 'vky-guide';
    guide.setAttribute('aria-label', 'Навигация YouTube');
    document.body.append(guide);
  }
  const route = location.pathname;
  if (guide.dataset.route !== route) {
    guide.dataset.route = route;
    guide.dataset.collapsed = !live && (/^\/(?:video|clip)[-/]/.test(route) || route === '/clips') ? 'true' : 'false';
  }
  const sections = guideItems(live);
  const signature = JSON.stringify(sections);
  if (signature !== lastGuideSignature || guide.childElementCount === 0) {
    guide.replaceChildren();
    for (const [title, items] of sections) appendSection(guide, title, items);
    lastGuideSignature = signature;
  }
  for (const link of guide.querySelectorAll<HTMLAnchorElement>('.vky-guide-link')) {
    try {
      const url = new URL(link.href);
      link.classList.toggle('vky-guide-active', url.hostname === location.hostname && url.pathname === location.pathname);
    } catch { /* Native links remain available if VK supplies an unusual URL. */ }
  }
  const toggle = live ? document.querySelector<HTMLElement>('#topMenu button') : document.querySelector<HTMLElement>('[data-testid="video_left_menu_toggle"]');
  if (toggle && !toggle.dataset.vkyGuideToggle) {
    toggle.dataset.vkyGuideToggle = '1';
    toggle.addEventListener('click', () => {
      const panel = document.getElementById('vky-guide');
      if (panel) panel.dataset.collapsed = panel.dataset.collapsed === 'true' ? 'false' : 'true';
    });
  }
}

const textChanges: Record<string, string> = {
  main_menu_vk_live: 'Трансляции',
  main_menu_clips: 'Shorts',
  main_menu_my_history: 'История',
  main_menu_my_liked: 'Понравившиеся',
  main_menu_my_playlists: 'Плейлисты',
  main_menu_authors_cabinet: 'YouTube Studio',
};
function replaceLabel(element: Element, label: string): void {
  const original = element.textContent?.trim() || '';
  const node = [...element.querySelectorAll('*')].find(child => child.children.length === 0 && child.textContent?.trim() === original) || element;
  if (!(node instanceof HTMLElement) || node.textContent?.trim() === label) return;
  if (!node.dataset.vkyOriginalText) node.dataset.vkyOriginalText = node.textContent?.trim() || '';
  node.textContent = label;
}

function decorateLabels(): void {
  for (const [id, text] of Object.entries(textChanges)) {
    const element = document.querySelector(`[data-testid="${id}"]`);
    if (element) replaceLabel(element, text);
  }
  for (const tab of document.querySelectorAll('[role="tab"],.vkuiTabsItem__host')) {
    if (tab.textContent?.trim() === 'Клипы') replaceLabel(tab, 'Shorts');
  }
  const search = document.querySelector<HTMLInputElement>('#video_service_search_input');
  if (search && search.placeholder !== 'Поиск') {
    search.dataset.vkyOriginalPlaceholder ||= search.placeholder;
    search.placeholder = 'Поиск';
  }
  const save = document.querySelector('[data-testid="video_page_add_to_my_playlist"]');
  if (save) {
    const label = [...save.children].find(x => /Добавить/.test(x.textContent || ''));
    if (label) replaceLabel(label, 'Сохранить');
  }
  for (const heading of document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')) {
    if (heading.textContent?.trim() === 'Клипы') replaceLabel(heading, 'Shorts');
  }
  for (const link of document.querySelectorAll('a[href*="/clips"]')) {
    if (link.textContent?.trim() === 'Больше клипов') replaceLabel(link, 'Все Shorts');
  }
}

const LOCAL_DISLIKES_KEY = 'vkyLocalDislikes';
let dislikes: Record<string, boolean> | null = null;
let loadingDislikes = false;
function loadDislikes(): void {
  if (dislikes || loadingDislikes) return;
  loadingDislikes = true;
  chrome.storage.local.get(LOCAL_DISLIKES_KEY, result => {
    dislikes = (result[LOCAL_DISLIKES_KEY] as Record<string, boolean> | undefined) || {};
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-vky-dislike-key]')) {
      button.setAttribute('aria-pressed', dislikes[button.dataset.vkyDislikeKey || ''] ? 'true' : 'false');
    }
  });
}
function dislikeButton(key: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.vkyDislikeKey = key;
  button.setAttribute('aria-label', 'Не нравится — локальная отметка');
  button.title = 'Не нравится — локальная отметка';
  button.setAttribute('aria-pressed', dislikes?.[key] ? 'true' : 'false');
  button.innerHTML = svg('dislike', className.includes('comment') ? 16 : 24);
  button.addEventListener('click', event => {
    event.stopPropagation();
    dislikes ||= {};
    dislikes[key] = !dislikes[key];
    button.setAttribute('aria-pressed', dislikes[key] ? 'true' : 'false');
    chrome.storage.local.set({ [LOCAL_DISLIKES_KEY]: dislikes });
  });
  return button;
}

function decorateReactions(): void {
  const like = document.querySelector<HTMLElement>('[data-testid="video_page_like_button"]');
  if (!like) return;
  const videoKey = `video:${location.pathname}`;
  if (!('vkyOriginalAria' in like.dataset)) like.dataset.vkyOriginalAria = like.getAttribute('aria-label') || '';
  if (!('vkyOriginalTitle' in like.dataset)) like.dataset.vkyOriginalTitle = like.getAttribute('title') || '';
  like.setAttribute('aria-label', 'Нравится');
  like.title = 'Нравится';
  if (!like.querySelector('.vky-thumb-up')) {
    const icon = document.createElement('span');
    icon.className = 'vky-thumb-up';
    icon.innerHTML = svg('like');
    like.prepend(icon);
  }
  if (!like.nextElementSibling?.classList.contains('vky-dislike')) {
    like.after(dislikeButton(videoKey, 'vky-dislike'));
  }
  const nativeIcon = like.querySelector('svg[class*="vkuiIcon--like_"]');
  like.classList.toggle('vky-liked', !!nativeIcon && !nativeIcon.getAttribute('class')?.includes('outline'));
  for (const commentLike of document.querySelectorAll<HTMLElement>('[data-testid="comment-like"]')) {
    const comment = commentLike.closest<HTMLElement>('[data-testid="comment"]');
    const key = `comment:${location.pathname}:${comment?.id || ''}`;
    if (!commentLike.querySelector('.vky-thumb-up')) {
      const icon = document.createElement('span');
      icon.className = 'vky-thumb-up';
      icon.innerHTML = svg('like', 16);
      commentLike.prepend(icon);
    }
    if (!commentLike.nextElementSibling?.classList.contains('vky-comment-dislike')) commentLike.after(dislikeButton(key, 'vky-comment-dislike'));
  }
  loadDislikes();
}

function decorateShorts(): void {
  const like = document.querySelector<HTMLElement>('[data-testid="clips-controls-like-button"]');
  if (!like || like.querySelector('.vky-thumb-up')) return;
  const icon = document.createElement('span');
  icon.className = 'vky-thumb-up';
  icon.innerHTML = svg('like', 28);
  like.append(icon);
}

function enhanceLive(): void {
  const main = document.querySelector<HTMLElement>('[class*="Main_root"]');
  if (!main) return;
  if (!main.querySelector('#vky-live-heading')) {
    const title = document.createElement('h1');
    title.id = 'vky-live-heading';
    title.textContent = 'Трансляции';
    main.prepend(title);
  }
  for (const section of main.querySelectorAll<HTMLElement>('[class*="CatalogVideoLayout_root"]')) {
    const title = section.querySelector('[class*="CatalogVideoLayout_title"]')?.textContent?.trim() || '';
    section.classList.toggle('vky-live-primary', /Сейчас в эфире/.test(title));
    section.classList.toggle('vky-live-other', !/Сейчас в эфире/.test(title));
  }
}

export function enhanceSite(): void {
  const live = location.hostname === 'live.vkvideo.ru';
  mountGuide(live);
  if (live) enhanceLive();
  else {
    decorateLabels();
    if (/^\/video[-/]/.test(location.pathname)) decorateReactions();
    if (/^\/clip[-/]/.test(location.pathname) || location.pathname === '/clips') decorateShorts();
  }
}

export function restoreSite(): void {
  document.getElementById('vky-guide')?.remove();
  document.getElementById('vky-live-heading')?.remove();
  document.querySelectorAll('.vky-live-primary,.vky-live-other').forEach(node => node.classList.remove('vky-live-primary', 'vky-live-other'));
  for (const node of document.querySelectorAll<HTMLElement>('[data-vky-original-text]')) {
    node.textContent = node.dataset.vkyOriginalText || '';
    delete node.dataset.vkyOriginalText;
  }
  const search = document.querySelector<HTMLInputElement>('#video_service_search_input');
  if (search?.dataset.vkyOriginalPlaceholder) {
    search.placeholder = search.dataset.vkyOriginalPlaceholder;
    delete search.dataset.vkyOriginalPlaceholder;
  }
  document.querySelectorAll('.vky-dislike,.vky-comment-dislike,.vky-thumb-up').forEach(node => node.remove());
  for (const like of document.querySelectorAll<HTMLElement>('[data-testid="video_page_like_button"][data-vky-original-aria]')) {
    if (like.dataset.vkyOriginalAria) like.setAttribute('aria-label', like.dataset.vkyOriginalAria); else like.removeAttribute('aria-label');
    if (like.dataset.vkyOriginalTitle) like.title = like.dataset.vkyOriginalTitle; else like.removeAttribute('title');
    delete like.dataset.vkyOriginalAria;
    delete like.dataset.vkyOriginalTitle;
    like.classList.remove('vky-liked');
  }
}
