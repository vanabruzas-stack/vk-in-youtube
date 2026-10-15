import { ownerChannel } from './owner';
import { dateRange, type Preset } from './shared';

chrome.runtime.setUninstallURL(ownerChannel.url);

type Request =
  | { type: 'auth'; interactive: boolean }
  | { type: 'analytics'; preset: Preset; report: 'videos' | 'daily' | 'summary'; videoId?: string; videoIds?: string[] };
type Row = Record<string, string | number>;
const cache = new Map<string, { until: number; rows: Row[] }>();

function configured(): boolean {
  return Boolean(chrome.runtime.getManifest().oauth2?.client_id);
}
async function token(interactive: boolean): Promise<string> {
  if (!configured()) throw new Error('Сначала укажите OAuth Client ID при сборке расширения.');
  const result = await chrome.identity.getAuthToken({ interactive });
  const value = typeof result === 'string' ? result : result.token;
  if (!value) throw new Error('Google не выдал токен для чтения статистики.');
  return value;
}
async function report(request: Extract<Request, { type: 'analytics' }>): Promise<Row[]> {
  const ids = [...new Set((request.videoIds || []).filter(id => /^[A-Za-z0-9_-]{11}$/.test(id)))].slice(0, 500);
  const key = [request.report, request.preset, request.videoId || '', ids.join(',')].join(':');
  const old = cache.get(key);
  if (old && old.until > Date.now()) return old.rows;
  const accessToken = await token(false);
  const { startDate, endDate } = dateRange(request.preset);
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  if (request.report === 'videos') {
    url.searchParams.set('dimensions', 'video');
    url.searchParams.set('metrics', 'views,likes,comments,shares,estimatedMinutesWatched');
    url.searchParams.set('sort', '-views');
    url.searchParams.set('maxResults', ids.length ? String(ids.length) : '200');
    if (ids.length) url.searchParams.set('filters', `video==${ids.join(',')}`);
  } else if (request.report === 'daily') {
    url.searchParams.set('dimensions', 'day');
    url.searchParams.set('metrics', 'views,estimatedMinutesWatched');
    url.searchParams.set('sort', 'day');
  } else {
    url.searchParams.set('metrics', 'views,likes,comments,shares,estimatedMinutesWatched,subscribersGained,subscribersLost');
  }
  if (request.videoId) url.searchParams.set('filters', `video==${request.videoId}`);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 401) {
    await chrome.identity.removeCachedAuthToken({ token: accessToken });
    throw new Error('Срок доступа истёк. Подключите статистику повторно.');
  }
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json()).error?.message || ''; } catch { /* empty */ }
    throw new Error(`YouTube Analytics: ${detail || response.status}`);
  }
  const data = await response.json() as { columnHeaders?: Array<{ name: string }>; rows?: Array<Array<string | number>> };
  const headers = data.columnHeaders?.map(item => item.name) || [];
  const rows = (data.rows || []).map(values => Object.fromEntries(headers.map((name, i) => [name, values[i]])));
  cache.set(key, { until: Date.now() + 15 * 60_000, rows });
  return rows;
}

chrome.runtime.onMessage.addListener((message: Request, _sender, sendResponse) => {
  (async () => {
    if (message.type === 'auth') {
      await token(message.interactive);
      return { ok: true };
    }
    if (message.type === 'analytics') return { ok: true, rows: await report(message) };
    throw new Error('Неизвестный запрос');
  })().then(sendResponse, error => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});
