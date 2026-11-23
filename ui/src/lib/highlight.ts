// Destaque de sintaxe Lua para o editor de converters, como o web-diff-viewer: Shiki core com o
// motor de regex em JavaScript (sem WASM, a CSP segue estrita) e só a gramática e o tema usados,
// carregados sob demanda. Devolve tokens (cor por trecho), aplicados via CSSOM: HTML com
// style="..." seria bloqueado pela CSP.

import type { HighlighterCore, ThemedToken } from 'shiki/core';

const THEME = 'tokyo-night';
let highlighter: Promise<HighlighterCore> | undefined;

function load(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, lua, theme] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
      import('@shikijs/langs/lua'),
      import('@shikijs/themes/tokyo-night'),
    ]);
    return createHighlighterCore({
      langs: [lua.default],
      themes: [theme.default],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  })();
  return highlighter;
}

/** Linhas de tokens coloridos do código Lua. */
export async function highlightLua(code: string): Promise<ThemedToken[][]> {
  const h = await load();
  return h.codeToTokens(code, { lang: 'lua', theme: THEME }).tokens;
}
