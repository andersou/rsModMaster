import { createEffect, createSignal, For, on, Show } from 'solid-js';
import { api } from '../api';
import { app, type RawLine } from '../appStore';
import { localIso } from '../lib/time';
import { toast } from '../toasts';
import { Icon } from './Icon';

const lineText = (line: RawLine) => `${line.type} ${localIso(line.at)} ${line.mode} ${line.hex}`;
const [selected, setSelected] = createSignal<RawLine | null>(null);

/** Quantidade, salvar e limpar, no cabeçalho do painel. */
export function BusTools() {
  const save = async () => {
    const text = app.raw().map(lineText).join('\n');
    try {
      const path = await api.saveText(text ? `${text}\n` : '', 'bus-monitor.txt', 'Save Bus Monitor Raw Data');
      if (path) toast(`Saved to ${path}`);
    } catch (err) {
      toast(String(err), 'danger');
    }
  };
  return (
    <>
      <span class="context">last {app.raw().length} frames</span>
      <span class="log-sep" />
      <button class="btn ghost small square" type="button" title="Save the frames…" aria-label="Save the frames" disabled={!app.raw().length} onClick={save}>
        <Icon name="download" />
      </button>
      <button
        class="btn ghost small square"
        type="button"
        title="Clear the frames"
        aria-label="Clear the frames"
        disabled={!app.raw().length}
        onClick={() => {
          app.clearRaw();
          setSelected(null);
        }}
      >
        <Icon name="trash-2" />
      </button>
    </>
  );
}

/** Quadros brutos Tx/Rx e os campos ADU/PDU do quadro escolhido. Fica no painel, não num diálogo:
 *  dá para ler, escrever e escanear olhando os quadros. */
export function BusView() {
  let list!: HTMLDivElement;
  // segue o fim da lista enquanto o usuário não rolar para cima
  createEffect(
    on(app.raw, () => {
      if (list && list.scrollHeight - list.scrollTop - list.clientHeight < 48) queueMicrotask(() => (list.scrollTop = list.scrollHeight));
    }),
  );
  const detail = () => {
    const line = selected();
    return line ? `Type: ${line.type}\nTimestamp: ${localIso(line.at)}\nMode: ${line.mode}\n${line.detail}` : 'Select a raw line to decode ADU/PDU fields.';
  };
  return (
    <div class="bus-body">
      <div class="log-box">
        <div class="log-list" ref={list} role="listbox" aria-label="Raw frames">
          <For each={app.raw()}>
            {(line) => (
              <div
                class={`log-row raw ${line.type.toLowerCase()}`}
                role="option"
                tabindex="-1"
                aria-selected={selected() === line}
                onClick={() => setSelected(line)}
              >
                <span class="dir">{line.type}</span>
                <span class="time">{localIso(line.at).slice(11)}</span>
                <span class="msg">{line.hex}</span>
              </div>
            )}
          </For>
        </div>
        <Show when={!app.raw().length}>
          <div class="log-empty">
            <Icon name="activity" />
            <span class="log-empty-title">No frames yet</span>
            <span class="log-empty-text">Read, write or scan to see the raw Tx/Rx frames here.</span>
          </div>
        </Show>
      </div>
      <pre class="frame-detail" aria-label="ADU / PDU">
        {detail()}
      </pre>
    </div>
  );
}
