// Aviso de versão nova: na inicialização, a última release do GitHub (sem rascunhos nem
// pré-releases). A atualização é manual: o botão da barra de título abre a página da release.
// A preferência fica em localStorage, como o tema (não vai no INI da sessão).

import { createSignal } from 'solid-js';
import { isNewer } from './lib/update';

export const RELEASES_API = 'https://api.github.com/repos/andersou/rsModMaster/releases/latest';
const KEY = 'rsmodmaster.checkUpdates';

const [enabled, setEnabledSignal] = createSignal(localStorage.getItem(KEY) !== 'false');
const [available, setAvailable] = createSignal<{ version: string; url: string } | null>(null);

export const updates = {
  enabled,
  available,
  setEnabled(value: boolean) {
    localStorage.setItem(KEY, String(value));
    setEnabledSignal(value);
  },
  async check() {
    try {
      const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return;
      const release = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
      const { tag_name: tag, html_url: url } = release;
      // só um link do próprio GitHub (o opener também só abre github.com)
      if (typeof tag !== 'string' || typeof url !== 'string' || !url.startsWith('https://github.com/')) return;
      if (isNewer(tag, __APP_VERSION__)) setAvailable({ version: tag.replace(/^v/, ''), url });
    } catch {
      // sem rede ou limite da API: tenta de novo na próxima inicialização
    }
  },
};
