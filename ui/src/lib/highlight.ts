// Destaque de sintaxe Lua para o editor de converters, como o web-diff-viewer: Shiki core com o
// motor de regex em JavaScript (sem WASM, a CSP segue estrita) e só a gramática e o tema usados,
// carregados sob demanda. Devolve tokens (cor por trecho), aplicados via CSSOM: HTML com
// style="..." seria bloqueado pela CSP.

import type { HighlighterCore, ThemedToken } from 'shiki/core';

const THEMES = { dark: 'tokyo-night', light: 'github-light' } as const;
let highlighter: Promise<HighlighterCore> | undefined;

function load(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, lua, dark, light] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
      import('@shikijs/langs/lua'),
      import('@shikijs/themes/tokyo-night'),
      import('@shikijs/themes/github-light'),
    ]);
    return createHighlighterCore({
      langs: [lua.default],
      themes: [dark.default, light.default],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  })();
  return highlighter;
}

/** Linhas de tokens coloridos do código Lua, no tema da janela. */
export async function highlightLua(code: string, theme: 'light' | 'dark'): Promise<ThemedToken[][]> {
  const h = await load();
  return h.codeToTokens(code, { lang: 'lua', theme: THEMES[theme] }).tokens;
}
