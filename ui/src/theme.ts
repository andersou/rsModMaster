// Tema da janela: preferência em localStorage (não no INI: carregar a sessão de um colega não
// pode trocar o tema), "System" acompanha o sistema ao vivo, e a janela nativa (barra de título,
// botões do macOS, fundo) segue o tema escolhido.

import { getCurrentWindow } from '@tauri-apps/api/window';
import { createEffect, createRoot, createSignal } from 'solid-js';
import { parseThemePref, resolveTheme, type ThemePref } from './lib/theme';

const KEY = 'rsmodmaster.theme';
const media = matchMedia('(prefers-color-scheme: dark)');
const [pref, setPrefSignal] = createSignal<ThemePref>(parseThemePref(localStorage.getItem(KEY)));
const [systemDark, setSystemDark] = createSignal(media.matches);
media.addEventListener('change', (event) => setSystemDark(event.matches));

export const themePref = pref;
export const theme = () => resolveTheme(pref(), systemDark());

export function setThemePref(value: ThemePref) {
  localStorage.setItem(KEY, value);
  setPrefSignal(value);
}

/** Aplica antes do primeiro render (sem flash no conteúdo) e depois a cada troca. */
export function startTheme() {
  document.documentElement.dataset.theme = theme();
  createRoot(() => {
    createEffect(() => {
      document.documentElement.dataset.theme = theme();
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      const win = getCurrentWindow();
      // null = a janela volta a seguir o sistema (e o prefers-color-scheme da webview junto)
      const fixed = pref();
      win.setTheme(fixed === 'system' ? null : fixed).catch(() => {});
      if (bg) win.setBackgroundColor(bg).catch(() => {});
    });
  });
}
