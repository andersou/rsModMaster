// Painel de baixo (como o devtools do Bruno): uma aba aberta por vez, ou nenhuma.

import { createRoot, createSignal } from 'solid-js';

export type PanelTab = 'log' | 'bus';

export const panel = createRoot(() => {
  const [tab, setTab] = createSignal<PanelTab | null>(null);
  return {
    tab,
    open: (value: PanelTab) => setTab(value),
    /** o botão da aba já aberta fecha o painel */
    toggle: (value: PanelTab) => setTab((current) => (current === value ? null : value)),
    close: () => setTab(null),
  };
});
