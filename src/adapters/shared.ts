export type Section = 'site' | 'studio';
export type Preset = '7d' | '30d' | 'all';
export interface Preferences {
  siteEnabled: boolean;
  studioEnabled: boolean;
  statsPanelEnabled: boolean;
  hideVidiq: boolean;
  sideExpanded: boolean;
  youtubeInRussia: boolean;
  preset: Preset;
}
export const defaults: Preferences = {
  siteEnabled: true,
  studioEnabled: true,
  statsPanelEnabled: true,
  hideVidiq: false,
  sideExpanded: false,
  youtubeInRussia: false,
  preset: '7d',
};
export function applyVidiqVisibility(hide: boolean): void {
  document.documentElement.classList.toggle('vkvk-hide-vidiq', hide);
}
export async function preferences(): Promise<Preferences> {
  const stored = await chrome.storage.local.get({ ...defaults, vidiqCompatV1: false });
  if (!stored.vidiqCompatV1) {
    stored.hideVidiq = false;
    await chrome.storage.local.set?.({ hideVidiq: false, vidiqCompatV1: true });
  }
  return { ...defaults, ...stored };
}
export const liveHubPath = '/channel/UC4R8DWoMoI7CAwX8_LjQHig';

export function contentRoute(path: string): string {
  if (path === '/') return 'home';
  if (path === '/results') return 'search';
  if (path === '/feed/trending') return 'trending';
  if (path === '/watch') return 'watch';
  if (path.startsWith('/shorts')) return 'shorts';
  if (path.startsWith('/playlist')) return 'playlist';
  if (path === '/feed/playlists') return 'playlists';
  if (path === '/feed/live' || path === liveHubPath) return 'live';
  if (path.startsWith('/channel/') || path.startsWith('/@') || path.startsWith('/c/')) return 'channel';
  if (path.includes('/subscriptions')) return 'subscriptions';
  if (path.includes('/history')) return 'history';
  if (path.includes('/live')) return 'live';
  return 'other';
}
export function studioRoute(path: string): string {
  if (/\/video\/[^/]+\/edit/.test(path)) return 'video-edit';
  if (/\/video\/[^/]+\/analytics/.test(path)) return 'video-analytics';
  if (path.includes('/videos')) return 'content';
  if (path.includes('/analytics')) return 'analytics';
  if (path.includes('/comments') || path.includes('/community')) return 'comments';
  if (path.includes('/monetization')) return 'monetization';
  if (path.includes('/customization')) return 'settings';
  if (path.includes('/settings')) return 'settings';
  return 'overview';
}
export function dateRange(preset: Preset, now = new Date()): { startDate: string; endDate: string } {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endDate = utc.toISOString().slice(0, 10);
  const start = new Date(utc);
  // YouTube Analytics treats both boundaries as inclusive.
  if (preset === '7d') start.setUTCDate(start.getUTCDate() - 6);
  else if (preset === '30d') start.setUTCDate(start.getUTCDate() - 29);
  else start.setTime(Date.UTC(2005, 0, 1));
  return { startDate: start.toISOString().slice(0, 10), endDate };
}
export const periodLabel: Record<Preset, string> = {
  '7d': 'Последние 7 дней',
  '30d': 'Последние 30 дней',
  all: 'За всё время',
};
export function formatMetric(value: number | null | undefined): string {
  return value == null ? '—' : new Intl.NumberFormat('ru-RU').format(value);
}
