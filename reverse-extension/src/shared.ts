export type SkinArea = 'site' | 'studio';

export const STORAGE_KEY = 'vkyReverseEnabled';

export function readEnabled(area: SkinArea, callback: (enabled: boolean) => void): void {
  chrome.storage.local.get(STORAGE_KEY, result => {
    const saved = result[STORAGE_KEY] as Partial<Record<SkinArea, boolean>> | undefined;
    callback(saved?.[area] !== false);
  });
}

export function installSkin(area: SkinArea): void {
  const root = document.documentElement;
  let enabled = true;
  let previousUrl = '';
  let updateQueued = false;

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
        root.classList.add(/^\/video[-/]/.test(path) ? 'vky-watch' : /^\/@/.test(path) ? 'vky-channel' : path === '/clips' ? 'vky-clips' : new URLSearchParams(location.search).has('q') ? 'vky-search' : 'vky-home');
      } else {
        const section = new URLSearchParams(location.search).get('section') || '';
        root.classList.add(section.includes('analytics') ? 'vky-analytics' : section.includes('comments') ? 'vky-comments' : section.includes('settings') ? 'vky-settings' : section.includes('content') ? 'vky-content' : 'vky-overview');
      }
    }
    const live = location.hostname === 'live.vkvideo.ru';
    const logo = document.querySelector<HTMLAnchorElement>('[data-testid="video_spa_header"] a[aria-label="На главную VK Видео"]')
      || (live ? document.querySelector<HTMLAnchorElement>('#topMenu a[class*="TopMenu_logoLink"]') : null);
    if (logo && !logo.querySelector('.vky-brand')) {
      const brand = document.createElement('span');
      brand.className = 'vky-brand';
      brand.setAttribute('aria-hidden', 'true');
      brand.innerHTML = '<svg viewBox="0 0 32 24" width="32" height="24" focusable="false"><rect width="32" height="24" rx="7" fill="#ff0033"/><path d="M13 6.5v11l9-5.5z" fill="white"/></svg><span>YouTube' + (area === 'studio' ? '<span class="vky-studio-word"> Studio</span>' : '') + '</span>' + (live ? '<span class="vky-live-badge">LIVE</span>' : '');
      logo.append(brand);
    }
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
  setInterval(() => { if (enabled && (location.href !== previousUrl || !root.classList.contains('vky-' + area))) queueRefresh(); }, 500);
}
