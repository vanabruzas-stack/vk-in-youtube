import { preferences, type Preferences, type Preset } from './adapters/shared';

const ids: Array<keyof Pick<Preferences, 'siteEnabled' | 'studioEnabled' | 'statsPanelEnabled' | 'hideVidiq' | 'youtubeInRussia'>> = ['siteEnabled', 'studioEnabled', 'statsPanelEnabled', 'hideVidiq', 'youtubeInRussia'];
const status = document.querySelector<HTMLParagraphElement>('#status')!;
void (async () => {
  const state = await preferences();
  for (const id of ids) {
    const input = document.querySelector<HTMLInputElement>(`#${id}`)!;
    input.checked = state[id];
    input.addEventListener('change', () => void chrome.storage.local.set({ [id]: input.checked }));
  }
  const select = document.querySelector<HTMLSelectElement>('#preset')!;
  select.value = state.preset;
  select.addEventListener('change', () => void chrome.storage.local.set({ preset: select.value as Preset }));
})();
document.querySelector<HTMLButtonElement>('#connect')!.addEventListener('click', async () => {
  status.textContent = 'Подключение…';
  const result = await chrome.runtime.sendMessage({ type: 'auth', interactive: true }) as { ok: boolean; error?: string };
  status.textContent = result.ok ? 'Статистика подключена. Обновите YouTube Studio.' : result.error || 'Не удалось подключить статистику.';
});
