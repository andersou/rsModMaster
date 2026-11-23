import { createEffect, createSignal, For, on } from 'solid-js';
import type { ThemedToken } from 'shiki/core';
import { highlightLua } from '../lib/highlight';
import { theme } from '../theme';

/** Editor mínimo com destaque de sintaxe: o código colorido fica por baixo e o textarea
 *  transparente por cima, então cursor, seleção, desfazer e colar continuam os do sistema. */
export function CodeEditor(props: {
  value: string;
  label: string;
  onInput: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => void;
}) {
  let layer!: HTMLPreElement;
  const [tokens, setTokens] = createSignal<ThemedToken[][] | null>(null);
  let seq = 0;
  createEffect(
    on(
      [() => props.value, theme],
      async ([code, current]) => {
        const mine = ++seq;
        try {
          const lines = await highlightLua(code, current);
          if (mine === seq) setTokens(lines);
        } catch {
          setTokens(null); // sem destaque, o texto continua visível pelo textarea
        }
      },
    ),
  );
  const sync = (event: Event) => {
    const el = event.currentTarget as HTMLTextAreaElement;
    layer.scrollTop = el.scrollTop;
    layer.scrollLeft = el.scrollLeft;
  };
  return (
    <div class="code-editor" classList={{ plain: tokens() === null }}>
      <pre class="code-layer" ref={layer} aria-hidden="true">
        <code>
          <For each={tokens() ?? []}>
            {(line) => (
              <div class="code-line">
                <For each={line}>{(token) => <span style={{ color: token.color, 'font-style': token.fontStyle === 1 ? 'italic' : undefined }}>{token.content}</span>}</For>
              </div>
            )}
          </For>
        </code>
      </pre>
      <textarea
        class="code-input"
        aria-label={props.label}
        spellcheck={false}
        autocomplete="off"
        wrap="off"
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onKeyDown={(e) => props.onKeyDown?.(e)}
        onScroll={sync}
      />
    </div>
  );
}
