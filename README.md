# VK в YouTube

Оформление YouTube и кабинета автора в виде VK Видео. Ролики, лента и студия остаются настоящими, меняется только оболочка.

Цвета и логотип, которые можно заменить без правки логики:

- `src/youtube-ui/site.css` — переменные `--vk-bg`, `--vk-panel`, `--vk-text`, `--vk-accent`
- `src/studio-ui/studio.css` — переменные `--vkvk-bg`, `--vkvk-panel`, `--vkvk-accent`
- `src/assets/fox-logo.jpg` — картинка лисы в шапке

Сборка: `npm install`, затем `npm test` и `npm run build`. Установщик: `dotnet publish installer/VkYouTube.Setup.csproj -c Release`.
