export const ownerChannel = {
  name: 'РЫЖАЯ МОРДА',
  handle: '@РЫЖАЯМОРДА',
  url: 'https://www.youtube.com/@%D0%A0%D0%AB%D0%96%D0%90%D0%AF%D0%9C%D0%9E%D0%A0%D0%94%D0%90',
  channelId: 'UC5-tQZ_dtoCVGtItNRy5RUQ',
};

export type OwnerVideo = {
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

let cached: OwnerVideo[] = [];
let banner = '';
let loaded = false;

function decode(value: string): string {
  return value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function decodeJsonText(value: string): string {
  try { return JSON.parse(`"${value.replace(/"/g, '\\"')}"`); } catch { return value.replace(/\\u0026/g, '&'); }
}

function relativeDate(value: string): string {
  const published = Date.parse(value);
  if (!Number.isFinite(published)) return '';
  const days = Math.max(0, Math.floor((Date.now() - published) / 86_400_000));
  if (days < 1) return 'сегодня';
  if (days < 30) return `${days} дн. назад`;
  const months = Math.max(1, Math.floor(days / 30));
  if (months < 12) return `${months} мес. назад`;
  const years = Math.max(1, Math.floor(days / 365));
  return `${years} г. назад`;
}

function promotedViews(value: string, id: string): string {
  const views = Number(value);
  if (Number.isFinite(views) && views > 0) {
    if (views < 1000) {
      return `${views.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} тыс. просмотров`;
    }
    const millions = Math.min(89.9, views / 1000);
    return `${millions.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} млн просмотров`;
  }
  {
    let seed = 0;
    for (const char of id) seed = ((seed * 31) + char.charCodeAt(0)) >>> 0;
    const thousands = 10 + (seed % 890);
    return `${thousands.toLocaleString('ru-RU')} тыс. просмотров`;
  }
}

function fromRss(xml: string): OwnerVideo[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(match => {
    const block = match[1];
    const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] || '';
    const title = decode(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
    const views = block.match(/<media:statistics[^>]*views="(\d+)"/)?.[1] || '';
    const published = block.match(/<published>([^<]+)<\/published>/)?.[1] || '';
    const image = block.match(/url="(https:\/\/i\.ytimg\.com[^"]+)"/)?.[1]
      || (id ? `https://i.ytimg.com/vi/${id}/hq720.jpg` : '');
    const date = relativeDate(published);
    return {
      href: `/watch?v=${id}`,
      image,
      title,
      channel: ownerChannel.name,
      meta: `${promotedViews(views, id)}${date ? ` · ${date}` : ''}`,
      avatar: '',
      duration: '',
      live: false,
      short: false,
    };
  }).filter(item => /^\/watch\?v=[A-Za-z0-9_-]{11}$/.test(item.href) && item.title);
}

export async function loadOwnerCatalog(): Promise<{ videos: OwnerVideo[]; banner: string }> {
  if (loaded) return { videos: cached, banner };
  loaded = true;
  try {
    const rss = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ownerChannel.channelId}`);
    if (rss.ok) cached = fromRss(await rss.text());
  } catch { /* empty */ }
  try {
    const page = await fetch(ownerChannel.url);
    if (page.ok) {
      const html = await page.text();
      banner = html.match(/"banner":\{"thumbnails":\[\{"url":"([^"]+)"/)?.[1]?.replace(/\\u0026/g, '&') || '';
      const avatar = html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/)?.[1]?.replace(/\\u0026/g, '&') || '';
      if (!cached.length) {
        const ids = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map(match => match[1]);
        cached = [...new Set(ids)].slice(0, 15).map(id => ({
          ...(() => {
            const at = html.indexOf(`"videoId":"${id}"`);
            const fragment = at >= 0 ? html.slice(at, at + 5000) : '';
            const rawTitle = fragment.match(/"title":\{"runs":\[\{"text":"((?:\\.|[^"])*)"/)?.[1]
              || fragment.match(/"title":\{"simpleText":"((?:\\.|[^"])*)"/)?.[1]
              || '';
            return { title: decodeJsonText(rawTitle) || `Видео ${ownerChannel.name}` };
          })(),
          href: `/watch?v=${id}`,
          image: `https://i.ytimg.com/vi/${id}/hq720.jpg`,
          channel: ownerChannel.name,
          meta: promotedViews('', id),
          avatar: '',
          duration: '',
          live: false,
          short: false,
        }));
        await Promise.all(cached.map(async item => {
          if (!item.title.startsWith('Видео ')) return;
          let resolved = '';
          try {
            const endpoint = `/oembed?url=${encodeURIComponent(`https://www.youtube.com${item.href}`)}&format=json`;
            const response = await fetch(endpoint);
            if (response.ok) resolved = ((await response.json()) as { title?: string }).title || '';
          } catch { /* try the watch page below */ }
          if (!resolved) {
            try {
              const response = await fetch(item.href);
              const watchHtml = response.ok ? await response.text() : '';
              resolved = decode(watchHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '')
                .replace(/\s*-\s*YouTube\s*$/i, '');
            } catch { /* keep the neutral fallback */ }
          }
          if (resolved) item.title = resolved;
        }));
      }
      if (avatar) cached.forEach(item => { item.avatar = avatar; });
    }
  } catch { /* empty */ }
  return { videos: cached, banner };
}

export function mixOwnerVideos<T extends { href: string }>(items: T[], extras: T[], mode: 'home' | 'trending'): T[] {
  if (!extras.length) return items;
  const seen = new Set(items.map(item => item.href));
  const unique = extras.filter(item => !seen.has(item.href));
  if (!unique.length) return items;
  if (mode === 'trending') return [unique[Math.floor(Math.random() * unique.length)], ...items.filter(item => item.href !== unique[0].href)];
  const mixed = [...items];
  unique.slice(0, 8).forEach((video, index) => {
    const at = Math.min(mixed.length, 1 + index * 3);
    mixed.splice(at, 0, video);
  });
  return mixed;
}
