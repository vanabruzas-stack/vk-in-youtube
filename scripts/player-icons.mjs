import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// These SVGs come from @vkontakte/icons (MIT), already used by the VK shell.
const root = resolve('node_modules/@vkontakte/icons/src/svg/24');
const icons = {
  play: 'play_24',
  pause: 'pause_24',
  next: 'skip_next_24',
  volume: 'volume_24',
  mute: 'mute_cross_24',
  subtitles: 'subtitles_outline_24',
  settings: 'gear_outline_24',
  miniplayer: 'picture_in_picture_16x9_outline_24',
  fullscreen: 'fullscreen_24',
  fullscreenExit: 'fullscreen_exit_24',
  cast: 'airplay_video_outline_24',
};

let css = `
/* VK Icons: the native player keeps its own button sizes, handlers and layout. */
html.vkvk-site[data-vkvk-route='watch'] #movie_player :is(.ytp-play-button,.ytp-next-button,.ytp-mute-button,.ytp-subtitles-button,.ytp-settings-button,.ytp-miniplayer-button,.ytp-pip-button,.ytp-fullscreen-button,.ytp-remote-button){position:relative!important}
html.vkvk-site[data-vkvk-route='watch'] #movie_player :is(.ytp-play-button,.ytp-next-button,.ytp-mute-button,.ytp-subtitles-button,.ytp-settings-button,.ytp-miniplayer-button,.ytp-pip-button,.ytp-fullscreen-button,.ytp-remote-button)>svg{visibility:hidden!important}
html.vkvk-site[data-vkvk-route='watch'] #movie_player :is(.ytp-play-button,.ytp-next-button,.ytp-mute-button,.ytp-subtitles-button,.ytp-settings-button,.ytp-miniplayer-button,.ytp-pip-button,.ytp-fullscreen-button,.ytp-remote-button)::before{content:'';position:absolute;left:50%;top:50%;width:24px;height:24px;transform:translate(-50%,-50%);background:#fff;pointer-events:none;mask-repeat:no-repeat;mask-position:center;mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain}
`;
for (const [key, file] of Object.entries(icons)) {
  const svg = (await readFile(resolve(root, `${file}.svg`), 'utf8')).trim();
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  css += `html.vkvk-site[data-vkvk-route='watch'] #movie_player{--vkvk-player-${key}:url("${uri}")}\n`;
}
css += `
html.vkvk-site[data-vkvk-route='watch'] #movie_player .ytp-play-button::before{mask-image:var(--vkvk-player-play);-webkit-mask-image:var(--vkvk-player-play)}
html.vkvk-site[data-vkvk-route='watch'] #movie_player.playing-mode .ytp-play-button::before{mask-image:var(--vkvk-player-pause);-webkit-mask-image:var(--vkvk-player-pause)}
html.vkvk-site[data-vkvk-route='watch'] #movie_player .ytp-next-button::before{mask-image:var(--vkvk-player-next);-webkit-mask-image:var(--vkvk-player-next)}
html.vkvk-site[data-vkvk-route='watch'] #movie_player .ytp-mute-button::before{mask-image:var(--vkvk-player-volume);-webkit-mask-image:var(--vkvk-player-volume)}
html.vkvk-site[data-vkvk-route='watch'] #movie_player.ytp-muted .ytp-mute-button::before{mask-image:var(--vkvk-player-mute);-webkit-mask-image:var(--vkvk-player-mute)}
html.vkvk-site[data-vkvk-route='watch'] #movie_player .vkvk-volume-toggle::before{content:'';position:absolute;left:50%;top:50%;width:24px;height:24px;transform:translate(-50%,-50%);background:#fff;pointer-events:none;mask:var(--vkvk-player-volume) center/contain no-repeat;-webkit-mask:var(--vkvk-player-volume) center/contain no-repeat}
html.vkvk-site[data-vkvk-route='watch'] #movie_player .vkvk-volume-control.vkvk-volume-muted .vkvk-volume-toggle::before{mask-image:var(--vkvk-player-mute);-webkit-mask-image:var(--vkvk-player-mute)}
html.vkvk-site[data-vkvk-route='watch'] #movie_player .ytp-subtitles-button::before{mask-image:var(--vkvk-player-subtitles);-webkit-mask-image:var(--vkvk-player-subtitles)}
html.vkvk-site[data-vkvk-route='watch'] #movie_player .ytp-settings-button::before{mask-image:var(--vkvk-player-settings);-webkit-mask-image:var(--vkvk-player-settings)}
html.vkvk-site[data-vkvk-route='watch'] #movie_player :is(.ytp-miniplayer-button,.ytp-pip-button)::before{mask-image:var(--vkvk-player-miniplayer);-webkit-mask-image:var(--vkvk-player-miniplayer)}
html.vkvk-site[data-vkvk-route='watch'] #movie_player .ytp-fullscreen-button::before{mask-image:var(--vkvk-player-fullscreen);-webkit-mask-image:var(--vkvk-player-fullscreen)}
html.vkvk-site[data-vkvk-route='watch'] #movie_player.ytp-fullscreen .ytp-fullscreen-button::before{mask-image:var(--vkvk-player-fullscreenExit);-webkit-mask-image:var(--vkvk-player-fullscreenExit)}
html.vkvk-site[data-vkvk-route='watch'] #movie_player .ytp-remote-button::before{mask-image:var(--vkvk-player-cast);-webkit-mask-image:var(--vkvk-player-cast)}
`;
export default css;
