import { STORAGE_KEY, type SkinArea } from './shared';

const toggles = [...document.querySelectorAll<HTMLInputElement>('input[data-area]')];
chrome.storage.local.get(STORAGE_KEY, result => {
  const values = result[STORAGE_KEY] as Partial<Record<SkinArea, boolean>> | undefined;
  for (const toggle of toggles) toggle.checked = values?.[toggle.dataset.area as SkinArea] !== false;
});
for (const toggle of toggles) {
  toggle.addEventListener('change', async () => {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const values = (result[STORAGE_KEY] || {}) as Partial<Record<SkinArea, boolean>>;
    values[toggle.dataset.area as SkinArea] = toggle.checked;
    await chrome.storage.local.set({ [STORAGE_KEY]: values });
  });
}
