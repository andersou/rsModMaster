// Painel de baixo (como o devtools do Bruno): uma aba aberta por vez, ou nenhuma.

import { createRoot, createSignal } from 'solid-js';

export type PanelTab = 'log' | 'bus';

const HEIGHT_KEY = 'rsmodmaster.panelHeight';
export const panel = createRoot(() => {
  const [tab, setTab] = createSignal<PanelTab | null>(null);
  const stored = Number(localStorage.getItem(HEIGHT_KEY));
  // `null`: a altura padrão do CSS
  const [height, setHeightSignal] = createSignal<number | null>(stored > 0 ? stored : null);
  return {
    tab,
    height,
    /** preferência em localStorage, como o tema */
    setHeight: (value: number | null) => {
      setHeightSignal(value);
      if (value === null) localStorage.removeItem(HEIGHT_KEY);
      else localStorage.setItem(HEIGHT_KEY, String(value));
    },
    open: (value: PanelTab) => setTab(value),
    /** o botão da aba já aberta fecha o painel */
    toggle: (value: PanelTab) => setTab((current) => (current === value ? null : value)),
    close: () => setTab(null),
  };
});
