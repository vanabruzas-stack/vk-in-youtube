const icons: Record<string, string> = {
  dashboard_aside_video_main: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>',
  dashboard_aside_video_my_content: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 6 4-6 4z"/>',
  dashboard_aside_video_analytics: '<path d="M3 20h18M5 16l4-5 4 2 6-8"/>',
  dashboard_aside_video_comments: '<path d="M4 4h16v13H9l-5 4zM8 9h8M8 13h5"/>',
  dashboard_aside_video_monetization: '<circle cx="12" cy="12" r="9"/><path d="M15 8c-1-.8-5-.8-5 .9 0 2 5 1 5 3.7 0 2-3.4 2.6-6 1.4M12 5v14"/>',
  dashboard_aside_video_community_settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
  dashboard_aside_cashout_welcome: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
};
const labels: Record<string, string> = {
  dashboard_aside_go_to_channel: 'Посмотреть канал',
  dashboard_aside_video_main: 'Панель управления',
  dashboard_aside_video_my_content: 'Контент',
  dashboard_aside_video_comments: 'Сообщество',
  dashboard_aside_video_monetization: 'Доход',
  dashboard_aside_cashout_welcome: 'Платежи',
};

function changeText(element: Element, text: string): void {
  const original = element.textContent?.trim() || '';
  const node = [...element.querySelectorAll('*')].find(child => child.children.length === 0 && child.textContent?.trim() === original) || element;
  if (!(node instanceof HTMLElement) || node.textContent?.trim() === text) return;
  node.dataset.vkyOriginalText ||= node.textContent?.trim() || '';
  node.textContent = text;
}

export function enhanceStudio(): void {
  for (const [id, text] of Object.entries(labels)) {
    const nav = document.querySelector(`[data-testid="${id}"]`);
    if (nav) changeText(nav, text);
  }
  for (const [id, path] of Object.entries(icons)) {
    const nav = document.querySelector(`[data-testid="${id}"]`);
    if (!nav || nav.querySelector('.vky-studio-icon')) continue;
    const icon = document.createElement('span');
    icon.className = 'vky-studio-icon';
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
    nav.prepend(icon);
  }
  const heading = document.querySelector('[data-testid="dashboard_header"]');
  if (heading?.textContent?.trim() === 'Мой контент') changeText(heading, 'Контент');
  for (const tab of document.querySelectorAll('[data-testid^="dashboard_subsection_"]')) {
    if (tab.textContent?.trim() === 'Клипы') changeText(tab, 'Shorts');
  }
}

export function restoreStudio(): void {
  for (const node of document.querySelectorAll<HTMLElement>('[data-vky-original-text]')) {
    node.textContent = node.dataset.vkyOriginalText || '';
    delete node.dataset.vkyOriginalText;
  }
  document.querySelectorAll('.vky-studio-icon').forEach(node => node.remove());
}
