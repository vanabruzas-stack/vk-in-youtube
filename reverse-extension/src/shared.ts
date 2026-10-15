export type SkinArea = 'site' | 'studio';

export const STORAGE_KEY = 'vkyReverseEnabled';
const favicon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 24"><rect width="32" height="24" rx="7" fill="#ff0033"/><path d="M13 6.5v11l9-5.5z" fill="white"/></svg>');

export function readEnabled(area: SkinArea, callback: (enabled: boolean) => void): void {
  chrome.storage.local.get(STORAGE_KEY, result => {
    const saved = result[STORAGE_KEY] as Partial<Record<SkinArea, boolean>> | undefined;
    callback(saved?.[area] !== false);
  });
}

export function installSkin(area: SkinArea, enhance?: () => void, restore?: () => void): void {
  const root = document.documentElement;
  let enabled = true;
  let previousUrl = '';
  let updateQueued = false;
  let nativeTitle = '';

  const brandDocument = (live: boolean): void => {
    const current = document.title;
    if (current && !current.includes('YouTube')) nativeTitle = current;
    if (current && !current.includes('YouTube')) {
      const replaced = area === 'studio'
        ? current.replace(/Кабинет автора|VK\s*Видео/gi, 'YouTube Studio')
        : live ? current.replace(/VK\s*Видео\s*Live|VK\s*Видео/gi, 'YouTube') : current.replace(/VK\s*Видео/gi, 'YouTube');
      const titled = area === 'site' ? replaced.replace(/Клипы/gi, 'Shorts') : replaced;
      document.title = titled.includes('YouTube') ? titled : `${titled} — ${area === 'studio' ? 'YouTube Studio' : 'YouTube'}`;
    }
    if (document.head && !document.getElementById('vky-favicon')) {
      const link = document.createElement('link');
      link.id = 'vky-favicon';
      link.rel = 'icon';
      link.href = favicon;
      document.head.append(link);
    }
  };

  const refresh = (): void => {
    updateQueued = false;
    if (!enabled) return;
    root.classList.add('vky-' + area);
    const url = location.href;
    if (url !== previousUrl) {
      previousUrl = url;
      root.classList.remove('vky-home', 'vky-watch', 'vky-channel', 'vky-clips', 'vky-search', 'vky-content', 'vky-analytics', 'vky-comments', 'vky-settings', 'vky-overview');
      if (area === 'site') {
        const path = location.pathname;
        root.classList.add(/^\/video[-/]/.test(path) ? 'vky-watch' : /^\/@/.test(path) ? 'vky-channel' : path === '/clips' || /^\/clip[-/]/.test(path) ? 'vky-clips' : new URLSearchParams(location.search).has('q') ? 'vky-search' : 'vky-home');
      } else {
        const section = new URLSearchParams(location.search).get('section') || '';
        root.classList.add(section.includes('analytics') ? 'vky-analytics' : section.includes('comments') ? 'vky-comments' : section.includes('settings') ? 'vky-settings' : section.includes('content') ? 'vky-content' : 'vky-overview');
      }
    }
    const live = location.hostname === 'live.vkvideo.ru';
    const logo = document.querySelector<HTMLAnchorElement>('[data-testid="video_spa_header"] a[aria-label="На главную VK Видео"]')
      || document.querySelector<HTMLAnchorElement>('[data-vky-logo="1"]')
      || (live ? document.querySelector<HTMLAnchorElement>('#topMenu a[class*="TopMenu_logoLink"]') : null);
    if (logo) {
      logo.dataset.vkyLogo = '1';
      if (!('vkyOriginalAria' in logo.dataset)) logo.dataset.vkyOriginalAria = logo.getAttribute('aria-label') || '';
      logo.setAttribute('aria-label', area === 'studio' ? 'YouTube Studio' : 'Главная страница YouTube');
    }
    if (logo && !logo.querySelector('.vky-brand')) {
      const brand = document.createElement('span');
      brand.className = 'vky-brand';
      brand.setAttribute('aria-hidden', 'true');
      brand.innerHTML = '<svg viewBox="0 0 32 24" width="32" height="24" focusable="false"><rect width="32" height="24" rx="7" fill="#ff0033"/><path d="M13 6.5v11l9-5.5z" fill="white"/></svg><span>YouTube' + (area === 'studio' ? '<span class="vky-studio-word"> Studio</span>' : '') + '</span>' + (live ? '<span class="vky-live-badge">LIVE</span>' : '');
      logo.append(brand);
    }
    brandDocument(live);
    enhance?.();
  };
  const queueRefresh = (): void => {
    if (!updateQueued) {
      updateQueued = true;
      requestAnimationFrame(refresh);
    }
  };
  const apply = (value: boolean): void => {
    enabled = value && !/\/(?:challenge|captcha)\.html$/i.test(location.pathname);
    root.classList.toggle('vky-' + area, enabled);
    if (enabled) {
      previousUrl = '';
      queueRefresh();
    } else {
      root.classList.remove('vky-home', 'vky-watch', 'vky-channel', 'vky-clips', 'vky-search', 'vky-content', 'vky-analytics', 'vky-comments', 'vky-settings', 'vky-overview');
      document.getElementById('vky-favicon')?.remove();
      if (nativeTitle) document.title = nativeTitle;
      const logo = document.querySelector<HTMLAnchorElement>('[data-vky-logo="1"]');
      if (logo) logo.setAttribute('aria-label', logo.dataset.vkyOriginalAria || 'На главную VK Видео');
      restore?.();
    }
  };

  readEnabled(area, apply);
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local' || !changes[STORAGE_KEY]) return;
    const value = changes[STORAGE_KEY].newValue as Partial<Record<SkinArea, boolean>> | undefined;
    apply(value?.[area] !== false);
  });
  const observer = new MutationObserver(queueRefresh);
  const watch = (): void => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    else requestAnimationFrame(watch);
  };
  watch();
  setInterval(() => {
    if (enabled && (location.href !== previousUrl || !root.classList.contains('vky-' + area) || !document.title.includes('YouTube') || !document.getElementById('vky-favicon'))) queueRefresh();
  }, 500);
}
