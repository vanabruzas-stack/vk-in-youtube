import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const out = resolve('reverse-extension/dist');
const pkg = JSON.parse(await readFile(resolve('reverse-extension/package.json'), 'utf8'));
await mkdir(out, { recursive: true });
await build({
  entryPoints: {
    site: 'reverse-extension/src/site.ts',
    studio: 'reverse-extension/src/studio.ts',
    popup: 'reverse-extension/src/popup.ts',
  },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  minify: true,
  logLevel: 'info',
});
for (const name of ['site.css', 'studio.css', 'popup.css', 'popup.html']) {
  await copyFile(resolve('reverse-extension/src', name), resolve(out, name));
}

// Generate self-contained PNG icons so this extension is visibly separate.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type, data) {
  const label = Buffer.from(type);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  label.copy(result, 4);
  data.copy(result, 8);
  let crc = 0xffffffff;
  for (const b of result.subarray(4, 8 + data.length)) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return result;
}
function icon(size) {
  const rows = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * (1 + size * 4) + 1 + x * 4;
    const nx = (x + .5) / size, ny = (y + .5) / size;
    const rx = Math.abs(nx - .5), ry = Math.abs(ny - .5);
    const inside = rx < .45 && ry < .36 && (rx < .37 || ry < .28 || ((rx - .37) ** 2 + (ry - .28) ** 2 < .08 ** 2));
    const triangle = nx > .42 && nx < .70 && ny > .29 && ny < .71 && Math.abs(ny - .5) < (nx - .42) * .77;
    const color = triangle ? [255,255,255,255] : inside ? [255,0,51,255] : [0,0,0,0];
    rows.set(color, i);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
for (const size of [16, 32, 48, 128]) await writeFile(resolve(out, `icon${size}.png`), icon(size));

const manifest = {
  manifest_version: 3,
  name: 'YouTube',
  description: 'Оформление VK Видео и кабинета автора в стиле YouTube и YouTube Studio. Данные и действия остаются VK Видео.',
  version: pkg.version,
  icons: { 16: 'icon16.png', 32: 'icon32.png', 48: 'icon48.png', 128: 'icon128.png' },
  action: { default_popup: 'popup.html', default_title: 'YouTube' },
  permissions: ['storage'],
  content_scripts: [
    { matches: ['https://vkvideo.ru/*', 'https://www.vkvideo.ru/*', 'https://live.vkvideo.ru/*'], js: ['site.js'], css: ['site.css'], run_at: 'document_start' },
    { matches: ['https://cabinet.vkvideo.ru/*'], js: ['studio.js'], css: ['studio.css'], run_at: 'document_start' },
  ],
};
await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Built ${out}`);
